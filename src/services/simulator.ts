/**
 * Application service layer — wires the framework-independent core modules to the
 * persisted stores. A fresh client/engine is built per operation, so the *current*
 * active environment, endpoints and rules are always used.
 */
import { CpmPayloadParser } from '@/core/cpm/CpmPayloadParser';
import { DynamicApiClient } from '@/core/api/DynamicApiClient';
import type { HttpTransport } from '@/core/api/types';
import { LocalValidationEngine } from '@/core/validation/LocalValidationEngine';
import { BackendValidationAdapter } from '@/core/validation/BackendValidationAdapter';
import { ValidationOrchestrator } from '@/core/validation/ValidationOrchestrator';
import { TransactionEngine, TransactionError } from '@/core/transaction/TransactionEngine';
import { MockPaymentProcessor } from '@/core/transaction/MockPaymentProcessor';
import { BackendPaymentProcessor } from '@/core/transaction/BackendPaymentProcessor';
import type { ParsedQr, ValidationResult, Transaction } from '@/core/types';
import { effectiveExecutionMode, selectActiveEnvironment, useConfigStore } from '@/store/configStore';
import { apiLogSink, AppLog } from '@/store/logStore';
import { storeTransactionRepository } from '@/store/transactionStore';
import { useSessionStore, type ScanSource } from '@/store/sessionStore';

export const getConfig = () => useConfigStore.getState();
export const getActiveEnvironment = () => selectActiveEnvironment(getConfig());

export function createApiClient(transport?: HttpTransport): DynamicApiClient {
  const cfg = getConfig();
  return new DynamicApiClient({ environment: getActiveEnvironment(), endpoints: cfg.endpoints, app: cfg.app }, apiLogSink, transport);
}

export function createParser(): CpmPayloadParser {
  const v = getConfig().validation;
  return new CpmPayloadParser({ expiryTag: v.expiryTag, transactionReferenceTag: v.transactionReferenceTag });
}

export function createOrchestrator(): ValidationOrchestrator {
  const cfg = getConfig();
  const backend = cfg.app.apiIntegrationEnabled ? new BackendValidationAdapter(createApiClient()) : undefined;
  return new ValidationOrchestrator(
    new LocalValidationEngine(),
    backend,
    { apiIntegrationEnabled: cfg.app.apiIntegrationEnabled, fallbackToLocal: cfg.app.fallbackToLocalValidation },
    (level, msg, data) => AppLog.validation(level, msg, data),
  );
}

export function createTransactionEngine(): TransactionEngine {
  const cfg = getConfig();
  const mode = effectiveExecutionMode(cfg);
  const env = getActiveEnvironment();
  const processor = mode === 'REAL_API' ? new BackendPaymentProcessor(createApiClient(), cfg.merchant) : new MockPaymentProcessor(cfg.mock);
  return new TransactionEngine(
    storeTransactionRepository,
    processor,
    {
      merchant: cfg.merchant,
      environmentName: env.name,
      executionMode: mode,
      duplicateDetection: cfg.validation.duplicateDetection,
      transactionTimeoutMs: mode === 'REAL_API' ? env.timeoutMs : cfg.mock.transactionTimeoutMs,
      storeFullPayload: cfg.app.storeFullPayloadInHistory,
    },
    (level, msg, data, cid) => AppLog.transaction(level, msg, data, cid),
  );
}

/** Parses a payload and makes it the current scan in the session. */
export function ingestPayload(raw: string, source: ScanSource): ParsedQr {
  const parsed = createParser().parse(raw);
  const session = useSessionStore.getState();
  const firstSeen = { ...session.firstSeen };
  firstSeen[parsed.payloadHash] ??= new Date().toISOString();
  const errors = parsed.issues.filter((i) => i.severity === 'ERROR');
  AppLog.parsing(errors.length ? 'WARN' : 'INFO', `Parsed ${source.toLowerCase()} payload: format=${parsed.format}, encoding=${parsed.encoding}, ${parsed.byteLength} bytes, ${parsed.issues.length} issue(s)`, {
    issues: parsed.issues,
    payloadHash: parsed.payloadHash,
  });
  const amount = parsed.fields.amount ?? (session.amount > 0 ? session.amount : getConfig().merchant.defaultAmount);
  session.set({ parsed, source, validation: undefined, validationError: undefined, currentTransaction: undefined, amount, firstSeen });
  if (getConfig().app.autoValidateOnScan && source !== 'MANUAL') void validateCurrent();
  return parsed;
}

export async function validateCurrent(): Promise<ValidationResult | undefined> {
  const session = useSessionStore.getState();
  const parsed = session.parsed;
  if (!parsed) return undefined;
  const cfg = getConfig();
  session.set({ validating: true, validationError: undefined });
  try {
    const result = await createOrchestrator().validate({
      parsed,
      merchant: cfg.merchant,
      config: cfg.validation,
      amount: session.amount,
      history: storeTransactionRepository,
      firstSeenAt: session.firstSeen[parsed.payloadHash],
    });
    // Ignore stale results if another QR was scanned meanwhile.
    if (useSessionStore.getState().parsed?.payloadHash === parsed.payloadHash) {
      useSessionStore.getState().set({ validation: result, validating: false });
    }
    for (const c of result.checks.filter((c) => c.status === 'FAIL')) AppLog.validation('WARN', `${c.name}: ${c.description}`, c);
    return result;
  } catch (e) {
    const msg = (e as Error).message;
    AppLog.validation('ERROR', `Validation error: ${msg}`);
    useSessionStore.getState().set({ validating: false, validationError: msg });
    return undefined;
  }
}

export async function acceptPayment(): Promise<Transaction | undefined> {
  const s = useSessionStore.getState();
  if (!s.parsed || s.processing) return undefined;
  s.set({ processing: true });
  try {
    const tx = await createTransactionEngine().accept({
      parsed: s.parsed,
      validation: s.validation,
      amount: s.amount,
      onUpdate: (t) => useSessionStore.getState().set({ currentTransaction: t, lastTransaction: t }),
    });
    // Re-validate so the panel reflects that this single-use payload is now consumed.
    return tx;
  } catch (e) {
    const msg = e instanceof TransactionError ? e.message : `Unexpected error: ${(e as Error).message}`;
    AppLog.transaction('ERROR', msg);
    useSessionStore.getState().set({ validationError: msg });
    return undefined;
  } finally {
    useSessionStore.getState().set({ processing: false });
  }
}

export function rejectPayment(reason?: string): Transaction | undefined {
  const s = useSessionStore.getState();
  if (!s.parsed || s.processing) return undefined;
  const tx = createTransactionEngine().reject({ parsed: s.parsed, validation: s.validation, amount: s.amount, reason });
  s.set({ currentTransaction: tx, lastTransaction: tx });
  return tx;
}

export function clearTransaction(): void {
  useSessionStore.getState().clearCurrent();
}

export function setAmount(amount: number): void {
  const s = useSessionStore.getState();
  if (s.amount === amount) return;
  // Amount is part of business validation; a previous result no longer applies.
  s.set({ amount, validation: undefined });
}
