import type { MerchantConfig } from '../config/types';
import type {
  ExecutionMode,
  ParsedQr,
  PaymentProcessor,
  PaymentResult,
  Transaction,
  TransactionRepository,
  ValidationResult,
} from '../types';
import { generateTransactionId } from '../util/id';
import { CURRENCIES } from '../config/defaults';

export class TransactionError extends Error {
  constructor(public readonly code: 'NOT_VALIDATED' | 'VALIDATION_MISMATCH' | 'INVALID_AMOUNT' | 'IN_PROGRESS', message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export interface TransactionContext {
  merchant: MerchantConfig;
  environmentName: string;
  executionMode: ExecutionMode;
  duplicateDetection: boolean;
  /** Upper bound for any processor call; protects against processors that never resolve. */
  transactionTimeoutMs: number;
  storeFullPayload: boolean;
}

export interface TransactionLogger {
  (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown, correlationId?: string): void;
}

export interface AcceptInput {
  parsed: ParsedQr;
  validation: ValidationResult | undefined;
  amount: number;
  currency?: string;
  scenario?: string;
  onUpdate?: (tx: Transaction) => void;
  signal?: AbortSignal;
}

export interface RejectInput {
  parsed: ParsedQr;
  validation?: ValidationResult;
  amount: number;
  currency?: string;
  reason?: string;
  scenario?: string;
}

/**
 * Transaction Engine — orchestrates Accept / Reject. QR validation and payment authorization are
 * separate concerns: a VALID QR is a precondition, but authorization is delegated to the
 * PaymentProcessor (mock or real backend) chosen by the execution mode.
 */
export class TransactionEngine {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly processor: PaymentProcessor,
    private readonly ctx: TransactionContext,
    private readonly log: TransactionLogger = () => {},
  ) {}

  private base(parsed: ParsedQr, amount: number, currency: string | undefined, validation?: ValidationResult): Transaction {
    const now = new Date();
    const m = this.ctx.merchant;
    const cur = currency ?? m.currency;
    return {
      transactionId: generateTransactionId(now),
      timestamp: now.toISOString(),
      merchantId: parsed.fields.merchantId ?? m.merchantId,
      merchantName: parsed.fields.merchantName ?? m.merchantName,
      terminalId: parsed.fields.terminalId ?? m.terminalId,
      amount,
      currency: CURRENCIES[cur] ?? cur,
      status: 'PROCESSING',
      validationMode: validation?.mode ?? 'LOCAL',
      validationResultId: validation?.id,
      validationStatus: validation?.overallStatus,
      executionMode: this.processor.mode,
      environment: this.processor.mode === 'MOCK' ? 'Mock (standalone)' : this.ctx.environmentName,
      qrPayload: this.ctx.storeFullPayload ? parsed.raw : `${parsed.raw.slice(0, 12)}…(${parsed.raw.length} chars)`,
      payloadHash: parsed.payloadHash,
      applicationIdentifier: parsed.fields.applicationIdentifier,
      panMasked: parsed.fields.panMasked ?? parsed.fields.track2Masked,
      transactionReference: parsed.fields.transactionReference,
    };
  }

  async accept(input: AcceptInput): Promise<Transaction> {
    const { parsed, validation, amount } = input;
    if (!validation) throw new TransactionError('NOT_VALIDATED', 'QR must be validated before accepting payment');
    if (validation.payloadHash !== parsed.payloadHash) throw new TransactionError('VALIDATION_MISMATCH', 'Validation result does not belong to the current QR payload');
    if (validation.overallStatus !== 'VALID') throw new TransactionError('NOT_VALIDATED', 'QR did not pass validation; payment cannot be accepted');
    if (!Number.isFinite(amount) || amount <= 0) throw new TransactionError('INVALID_AMOUNT', 'Amount must be greater than zero');

    const tx = this.base(parsed, amount, input.currency, validation);
    tx.scenario = input.scenario;

    // Last-line duplicate guard (validation may be stale if the same QR was accepted meanwhile).
    if (this.ctx.duplicateDetection) {
      const dup = this.repository.findByPayloadHash(parsed.payloadHash).find((t) => t.status === 'APPROVED' || t.status === 'PROCESSING');
      if (dup) {
        const declined: Transaction = {
          ...tx,
          status: 'DECLINED',
          responseCode: '94',
          responseMessage: `Duplicate transaction (payload already used by ${dup.transactionId})`,
          completedAt: new Date().toISOString(),
          durationMs: 0,
        };
        this.repository.save(declined);
        this.log('WARN', declined.responseMessage!, { duplicateOf: dup.transactionId }, tx.transactionId);
        input.onUpdate?.(declined);
        return declined;
      }
    }

    this.repository.save(tx);
    this.log('INFO', `Transaction ${tx.transactionId} PROCESSING via ${this.processor.mode}`, { amount: tx.amount, currency: tx.currency }, tx.transactionId);
    input.onUpdate?.(tx);

    const started = performance.now();
    let result: PaymentResult;
    try {
      result = await this.withTimeout(this.processor.authorize({ transaction: tx, parsed }, input.signal));
    } catch (e) {
      const err = e as Error;
      result = { status: 'SYSTEM_ERROR', responseCode: '96', responseMessage: `Processor error: ${err.message}` };
    }

    const final: Transaction = {
      ...tx,
      status: result.status,
      responseCode: result.responseCode,
      responseMessage: result.responseMessage,
      referenceNumber: result.referenceNumber,
      backendResponse: result.backendResponse,
      apiLogIds: result.apiLogIds,
      completedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
    };
    this.repository.save(final);
    this.log(final.status === 'APPROVED' ? 'INFO' : 'WARN', `Transaction ${final.transactionId} ${final.status} [${final.responseCode}] ${final.responseMessage}`, { durationMs: final.durationMs }, final.transactionId);
    input.onUpdate?.(final);
    return final;
  }

  reject(input: RejectInput): Transaction {
    const tx: Transaction = {
      ...this.base(input.parsed, input.amount, input.currency, input.validation),
      status: 'REJECTED',
      responseCode: 'MR',
      responseMessage: input.reason || 'Rejected by merchant',
      rejectReason: input.reason || 'Rejected by merchant',
      completedAt: new Date().toISOString(),
      durationMs: 0,
      scenario: input.scenario,
    };
    this.repository.save(tx);
    this.log('INFO', `Transaction ${tx.transactionId} REJECTED by merchant`, { reason: tx.rejectReason }, tx.transactionId);
    return tx;
  }

  private withTimeout(p: Promise<PaymentResult>): Promise<PaymentResult> {
    const ms = this.ctx.transactionTimeoutMs;
    if (!ms || ms <= 0) return p;
    // The guard fires slightly after the configured timeout so processors can report TIMEOUT themselves.
    const guard = ms + 2000;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ status: 'TIMEOUT', responseCode: '68', responseMessage: `Transaction timed out after ${guard} ms` }), guard);
      p.then(
        (r) => {
          clearTimeout(t);
          resolve(r);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }
}
