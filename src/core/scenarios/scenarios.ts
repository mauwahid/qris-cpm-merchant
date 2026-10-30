import type { SimulatorConfig } from '../config/types';
import type { ApiLogSink } from '../api/types';
import type { ParsedQr, Transaction, ValidationResult, TransactionStatus } from '../types';
import { CpmPayloadParser } from '../cpm/CpmPayloadParser';
import { corruptCrc, generateSamplePayload, SAMPLE_MPM } from '../cpm/sampleGenerator';
import { DynamicApiClient } from '../api/DynamicApiClient';
import { jsonResponse, SimulatedBackendTransport, type SimulatedHandler } from '../api/SimulatedBackendTransport';
import { LocalValidationEngine } from '../validation/LocalValidationEngine';
import { BackendValidationAdapter } from '../validation/BackendValidationAdapter';
import { ValidationOrchestrator } from '../validation/ValidationOrchestrator';
import { TransactionEngine } from '../transaction/TransactionEngine';
import { MockPaymentProcessor } from '../transaction/MockPaymentProcessor';
import { BackendPaymentProcessor } from '../transaction/BackendPaymentProcessor';
import { InMemoryTransactionRepository } from '../repository/InMemoryTransactionRepository';

export type ScenarioExpectation =
  | { kind: 'VALIDATION_INVALID'; failingCheck: string }
  | { kind: 'TRANSACTION'; status: TransactionStatus };

export interface ScenarioDefinition {
  id: string;
  number: number;
  name: string;
  description: string;
  backend: boolean;
  expectation: ScenarioExpectation;
}

export interface ScenarioStep {
  at: string;
  message: string;
}

export interface ScenarioResult {
  scenario: ScenarioDefinition;
  passed: boolean;
  outcome: string;
  steps: ScenarioStep[];
  parsed?: ParsedQr;
  validation?: ValidationResult;
  transaction?: Transaction;
  durationMs: number;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'success', number: 1, name: 'Successful Payment', description: 'Valid simulated CPM QR, mock processor returns APPROVED.', backend: false, expectation: { kind: 'TRANSACTION', status: 'APPROVED' } },
  { id: 'declined', number: 2, name: 'Payment Declined', description: 'Valid QR, mock processor returns DECLINED (05).', backend: false, expectation: { kind: 'TRANSACTION', status: 'DECLINED' } },
  { id: 'invalid-payload', number: 3, name: 'Invalid QR Payload', description: 'Non-Base64 garbage text scanned.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'ENCODING' } },
  { id: 'invalid-crc', number: 4, name: 'Invalid CRC', description: 'Simulator CRC (DF7F) altered after generation.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'CRC' } },
  { id: 'unsupported-format', number: 5, name: 'Unsupported QR Format', description: 'A QRIS MPM (merchant-presented) payload is presented to the CPM terminal.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'QR_FORMAT' } },
  { id: 'duplicate', number: 6, name: 'Duplicate Transaction', description: 'The same single-use CPM payload is presented again after approval.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'DUPLICATE' } },
  { id: 'timeout', number: 7, name: 'Transaction Timeout', description: 'Mock processor never answers within the transaction timeout.', backend: false, expectation: { kind: 'TRANSACTION', status: 'TIMEOUT' } },
  { id: 'merchant-rejected', number: 8, name: 'Merchant Rejected Transaction', description: 'Merchant presses Reject Payment.', backend: false, expectation: { kind: 'TRANSACTION', status: 'REJECTED' } },
  { id: 'invalid-merchant', number: 9, name: 'Invalid Merchant ID', description: 'Terminal configured with a merchant ID that is not in the allowed list.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'MERCHANT_ID' } },
  { id: 'invalid-data', number: 10, name: 'Invalid Transaction Data', description: 'Amount above the configured maximum.', backend: false, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'AMOUNT' } },
  { id: 'backend-connection', number: 11, name: 'Backend Connection Failure', description: 'Simulated backend unreachable (network error), no local fallback.', backend: true, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'BACKEND_AVAILABILITY' } },
  { id: 'backend-rejected', number: 12, name: 'Backend Validation Rejected', description: 'Simulated backend answers responseCode 14 / INVALID.', backend: true, expectation: { kind: 'VALIDATION_INVALID', failingCheck: 'BACKEND_DECISION' } },
  { id: 'backend-system-error', number: 13, name: 'Backend System Error', description: 'Validation succeeds; payment endpoint answers HTTP 500 / 96.', backend: true, expectation: { kind: 'TRANSACTION', status: 'SYSTEM_ERROR' } },
  { id: 'backend-mapping', number: 14, name: 'Backend Response Mapping Failure', description: 'Validation succeeds; payment response has none of the mapped fields.', backend: true, expectation: { kind: 'TRANSACTION', status: 'MAPPING_ERROR' } },
];

const validOk = { responseCode: '00', responseMessage: 'QR valid', data: { validationStatus: 'VALID', checks: [{ name: 'Issuer token', status: 'PASS', description: 'Token active (simulated)' }] } };

function backendFor(id: string): SimulatedHandler {
  return (req) => {
    const isValidation = req.url.includes('/validate');
    switch (id) {
      case 'backend-connection':
        throw new TypeError('Failed to fetch (simulated connection refused)');
      case 'backend-rejected':
        return isValidation
          ? jsonResponse(200, { responseCode: '14', responseMessage: 'Invalid account / token (simulated)', data: { validationStatus: 'INVALID' } })
          : jsonResponse(200, { responseCode: '00' });
      case 'backend-system-error':
        return isValidation ? jsonResponse(200, validOk) : jsonResponse(500, { responseCode: '96', responseMessage: 'System malfunction (simulated)' }, 'Internal Server Error');
      case 'backend-mapping':
        return isValidation ? jsonResponse(200, validOk) : jsonResponse(200, { result: 'ok', unexpected: { shape: true } });
      default:
        return jsonResponse(200, validOk);
    }
  };
}

/**
 * Runs a scenario in an isolated sandbox: in-memory repository, simulated backend transport,
 * and a cloned configuration — the user's history and settings are never modified.
 */
export async function runScenario(def: ScenarioDefinition, baseConfig: SimulatorConfig, apiLogSink?: ApiLogSink): Promise<ScenarioResult> {
  const started = performance.now();
  const steps: ScenarioStep[] = [];
  const step = (message: string) => steps.push({ at: new Date().toISOString(), message });
  const cfg: SimulatorConfig = structuredClone(baseConfig);
  cfg.mock = { ...cfg.mock, response: 'APPROVED', processingDelayMs: 300, transactionTimeoutMs: 5000, responseCode: '', responseMessage: '', successRate: 100 };
  cfg.validation = { ...cfg.validation, duplicateDetection: true, crcProfile: cfg.validation.crcProfile === 'DISABLED' ? 'OPTIONAL' : cfg.validation.crcProfile };
  cfg.app = { ...cfg.app, apiIntegrationEnabled: def.backend, executionMode: def.backend ? 'REAL_API' : 'MOCK', fallbackToLocalValidation: false };
  let amount = cfg.merchant.defaultAmount || 50000;
  amount = Math.min(Math.max(amount, cfg.validation.minAmount), cfg.validation.maxAmount);
  let payload = generateSamplePayload({ aid: cfg.validation.supportedAids[0] });

  switch (def.id) {
    case 'declined': cfg.mock.response = 'DECLINED'; break;
    case 'invalid-payload': payload = 'THIS IS NOT A CPM QR!'; break;
    case 'invalid-crc': payload = corruptCrc(generateSamplePayload({ aid: cfg.validation.supportedAids[0], includeSimulatorCrc: true })); break;
    case 'unsupported-format': payload = SAMPLE_MPM; break;
    case 'timeout': cfg.mock = { ...cfg.mock, response: 'TIMEOUT', transactionTimeoutMs: 1500 }; break;
    case 'invalid-merchant':
      cfg.merchant.merchantId = '999999999999999';
      if (!cfg.validation.allowedMerchantIds.length) cfg.validation.allowedMerchantIds = ['123456789012345'];
      cfg.validation.allowedMerchantIds = cfg.validation.allowedMerchantIds.filter((m) => m !== '999999999999999');
      break;
    case 'invalid-data': amount = cfg.validation.maxAmount + 1; break;
  }
  step(`Configuration prepared (validation: ${def.backend ? 'BACKEND (simulated)' : 'LOCAL'}, execution: ${cfg.app.executionMode})`);

  const repo = new InMemoryTransactionRepository();
  const transport = new SimulatedBackendTransport(backendFor(def.id));
  const env = { ...(cfg.environments.find((e) => e.id === cfg.activeEnvironmentId) ?? cfg.environments[0]), name: 'Simulated Backend (scenario)', baseUrl: 'https://simulated-backend.local', useDevProxy: false };
  const client = new DynamicApiClient({ environment: env, endpoints: cfg.endpoints, app: cfg.app }, apiLogSink, transport);
  const parser = new CpmPayloadParser({ expiryTag: cfg.validation.expiryTag, transactionReferenceTag: cfg.validation.transactionReferenceTag });
  const local = new LocalValidationEngine();
  const orchestrator = new ValidationOrchestrator(local, new BackendValidationAdapter(client), { apiIntegrationEnabled: def.backend, fallbackToLocal: false }, (lvl, msg) => step(`[validation ${lvl}] ${msg}`));
  const processor = cfg.app.executionMode === 'REAL_API' ? new BackendPaymentProcessor(client, cfg.merchant) : new MockPaymentProcessor(cfg.mock);
  const engine = new TransactionEngine(
    repo,
    processor,
    { merchant: cfg.merchant, environmentName: env.name, executionMode: cfg.app.executionMode, duplicateDetection: true, transactionTimeoutMs: cfg.mock.transactionTimeoutMs, storeFullPayload: true },
    (lvl, msg) => step(`[transaction ${lvl}] ${msg}`),
  );

  const validate = (parsed: ParsedQr) =>
    orchestrator.validate({ parsed, merchant: cfg.merchant, config: cfg.validation, amount, history: repo, firstSeenAt: new Date().toISOString() });

  let parsed = parser.parse(payload);
  step(`Parsed payload: format=${parsed.format}, ${parsed.issues.length} issue(s)`);
  let validation: ValidationResult | undefined;
  let transaction: Transaction | undefined;
  try {
    if (def.id === 'duplicate') {
      validation = await validate(parsed);
      transaction = await engine.accept({ parsed, validation, amount, scenario: def.id });
      step(`First presentation → ${transaction.status}`);
      parsed = parser.parse(payload);
      step('Presenting the same payload again');
    }
    validation = await validate(parsed);
    step(`Validation ${validation.overallStatus} (${validation.summary.passed} pass / ${validation.summary.failed} fail / ${validation.summary.warnings} warn)`);
    if (validation.overallStatus === 'VALID') {
      if (def.id === 'merchant-rejected') transaction = engine.reject({ parsed, validation, amount, reason: 'Customer cancelled at counter (scenario)', scenario: def.id });
      else transaction = await engine.accept({ parsed, validation, amount, scenario: def.id });
      step(`Transaction ${transaction.transactionId} → ${transaction.status} [${transaction.responseCode}] ${transaction.responseMessage}`);
    } else if (def.id !== 'duplicate') {
      transaction = undefined;
    }
  } catch (e) {
    step(`Error: ${(e as Error).message}`);
  }

  let passed = false;
  let outcome = '';
  const exp = def.expectation;
  if (exp.kind === 'VALIDATION_INVALID') {
    const failed = validation?.checks.find((c) => c.id === exp.failingCheck && c.status === 'FAIL');
    passed = validation?.overallStatus === 'INVALID' && !!failed;
    outcome = validation ? `Validation ${validation.overallStatus}${failed ? `; ${failed.name}: ${failed.description}` : ''}` : 'No validation result';
  } else {
    const finalTx = def.id === 'duplicate' ? undefined : transaction;
    passed = finalTx?.status === exp.status;
    outcome = finalTx ? `Transaction ${finalTx.status} [${finalTx.responseCode}] ${finalTx.responseMessage}` : `No transaction (validation ${validation?.overallStatus ?? 'n/a'})`;
  }
  return { scenario: def, passed, outcome, steps, parsed, validation, transaction, durationMs: Math.round(performance.now() - started) };
}
