import type { MockConfig } from '../config/types';
import type { PaymentProcessor, PaymentRequest, PaymentResult } from '../types';
import { sleep as defaultSleep, type Sleeper } from './sleep';

export const MOCK_DEFAULTS: Record<MockConfig['response'], { code: string; message: string }> = {
  APPROVED: { code: '00', message: 'Approved' },
  DECLINED: { code: '05', message: 'Do not honor' },
  TIMEOUT: { code: '68', message: 'Response received too late (timeout)' },
  SYSTEM_ERROR: { code: '96', message: 'System malfunction' },
  CONNECTION_ERROR: { code: 'CE', message: 'Connection to issuer failed (simulated)' },
};

/**
 * Mock Payment Processor — simulates payment authorization results locally.
 * It does NOT authorise real payments; no network traffic is generated.
 */
export class MockPaymentProcessor implements PaymentProcessor {
  readonly mode = 'MOCK' as const;

  constructor(
    private readonly config: MockConfig,
    private readonly deps: { sleep?: Sleeper; random?: () => number } = {},
  ) {}

  async authorize(_req: PaymentRequest, signal?: AbortSignal): Promise<PaymentResult> {
    const sleep = this.deps.sleep ?? defaultSleep;
    const random = this.deps.random ?? Math.random;
    const { response, processingDelayMs, transactionTimeoutMs } = this.config;
    const def = MOCK_DEFAULTS[response];
    // A leftover approval code/message must never be reported for a non-approved outcome.
    const staleApproval = response !== 'APPROVED' && this.config.responseCode === MOCK_DEFAULTS.APPROVED.code;
    const code = (!staleApproval && this.config.responseCode) || def.code;
    const message = (!staleApproval && this.config.responseMessage) || def.message;

    if (response === 'TIMEOUT' || (transactionTimeoutMs > 0 && processingDelayMs >= transactionTimeoutMs)) {
      await sleep(transactionTimeoutMs > 0 ? transactionTimeoutMs : processingDelayMs, signal);
      return {
        status: 'TIMEOUT',
        responseCode: response === 'TIMEOUT' ? code : MOCK_DEFAULTS.TIMEOUT.code,
        responseMessage: response === 'TIMEOUT' ? message : `No response within ${transactionTimeoutMs} ms`,
      };
    }
    await sleep(processingDelayMs, signal);

    switch (response) {
      case 'APPROVED': {
        const rate = Math.min(100, Math.max(0, this.config.successRate ?? 100));
        if (random() * 100 >= rate) {
          return { status: 'DECLINED', responseCode: MOCK_DEFAULTS.DECLINED.code, responseMessage: `${MOCK_DEFAULTS.DECLINED.message} (success-rate simulation)` };
        }
        return { status: 'APPROVED', responseCode: code, responseMessage: message, referenceNumber: String(Math.floor(random() * 1e12)).padStart(12, '0') };
      }
      case 'DECLINED':
        return { status: 'DECLINED', responseCode: code, responseMessage: message };
      case 'SYSTEM_ERROR':
        return { status: 'SYSTEM_ERROR', responseCode: code, responseMessage: message };
      case 'CONNECTION_ERROR':
      default:
        return { status: 'CONNECTION_ERROR', responseCode: code, responseMessage: message };
    }
  }
}
