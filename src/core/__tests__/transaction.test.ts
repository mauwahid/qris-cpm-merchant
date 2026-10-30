import { describe, expect, it } from 'vitest';
import { CpmPayloadParser } from '../cpm/CpmPayloadParser';
import { generateSamplePayload } from '../cpm/sampleGenerator';
import { LocalValidationEngine } from '../validation/LocalValidationEngine';
import { TransactionEngine, TransactionError, type TransactionContext } from '../transaction/TransactionEngine';
import { MockPaymentProcessor } from '../transaction/MockPaymentProcessor';
import { BackendPaymentProcessor } from '../transaction/BackendPaymentProcessor';
import { InMemoryTransactionRepository } from '../repository/InMemoryTransactionRepository';
import { DynamicApiClient } from '../api/DynamicApiClient';
import { jsonResponse, SimulatedBackendTransport } from '../api/SimulatedBackendTransport';
import { defaultConfig } from '../config/defaults';
import type { MockConfig } from '../config/types';
import type { PaymentProcessor, Transaction } from '../types';
import { SCENARIOS, runScenario } from '../scenarios/scenarios';

const cfg = defaultConfig();
const parser = new CpmPayloadParser();
const noSleep = async () => {};
const ctx: TransactionContext = { merchant: cfg.merchant, environmentName: 'Test', executionMode: 'MOCK', duplicateDetection: true, transactionTimeoutMs: 0, storeFullPayload: true };

function setup(mock: Partial<MockConfig> = {}, processor?: PaymentProcessor) {
  const repo = new InMemoryTransactionRepository();
  const proc = processor ?? new MockPaymentProcessor({ ...cfg.mock, ...mock }, { sleep: noSleep, random: () => 0.1 });
  const engine = new TransactionEngine(repo, proc, ctx);
  const parsed = parser.parse(generateSamplePayload());
  const validation = new LocalValidationEngine().validateSync({ parsed, merchant: cfg.merchant, config: cfg.validation, amount: 50000, history: repo });
  return { repo, engine, parsed, validation };
}

describe('TransactionEngine', () => {
  it('approves a successful transaction and stores it', async () => {
    const { repo, engine, parsed, validation } = setup();
    const updates: Transaction[] = [];
    const tx = await engine.accept({ parsed, validation, amount: 50000, onUpdate: (t) => updates.push(t) });
    expect(tx.status).toBe('APPROVED');
    expect(tx.responseCode).toBe('00');
    expect(tx.transactionId).toMatch(/^TRX\d{14}[0-9A-F]{6}$/);
    expect(tx.referenceNumber).toMatch(/^\d{12}$/);
    expect(updates.map((u) => u.status)).toEqual(['PROCESSING', 'APPROVED']);
    expect(repo.get(tx.transactionId)?.status).toBe('APPROVED');
    expect(tx.validationMode).toBe('LOCAL');
    expect(tx.executionMode).toBe('MOCK');
  });

  it('declines a transaction', async () => {
    const { engine, parsed, validation } = setup({ response: 'DECLINED', responseCode: '05', responseMessage: 'Do not honor' });
    const tx = await engine.accept({ parsed, validation, amount: 50000 });
    expect(tx.status).toBe('DECLINED');
    expect(tx.responseCode).toBe('05');
  });

  it('honours the success rate', async () => {
    const repo = new InMemoryTransactionRepository();
    const engine = new TransactionEngine(repo, new MockPaymentProcessor({ ...cfg.mock, successRate: 0 }, { sleep: noSleep }), ctx);
    const parsed = parser.parse(generateSamplePayload());
    const validation = new LocalValidationEngine().validateSync({ parsed, merchant: cfg.merchant, config: cfg.validation, amount: 50000, history: repo });
    expect((await engine.accept({ parsed, validation, amount: 50000 })).status).toBe('DECLINED');
  });

  it('rejects a transaction on merchant request', () => {
    const { repo, engine, parsed, validation } = setup();
    const tx = engine.reject({ parsed, validation, amount: 50000, reason: 'Customer cancelled' });
    expect(tx.status).toBe('REJECTED');
    expect(tx.rejectReason).toBe('Customer cancelled');
    expect(repo.list()).toHaveLength(1);
  });

  it('blocks duplicate transactions for the same payload', async () => {
    const { engine, parsed, validation } = setup();
    expect((await engine.accept({ parsed, validation, amount: 50000 })).status).toBe('APPROVED');
    const dup = await engine.accept({ parsed, validation, amount: 50000 });
    expect(dup.status).toBe('DECLINED');
    expect(dup.responseCode).toBe('94');
  });

  it('times out when the processor exceeds the transaction timeout', async () => {
    const { engine, parsed, validation } = setup({ response: 'TIMEOUT', transactionTimeoutMs: 100 });
    const tx = await engine.accept({ parsed, validation, amount: 50000 });
    expect(tx.status).toBe('TIMEOUT');
    expect(tx.responseCode).toBe('68');
  });

  it('times out when processing delay reaches the timeout', async () => {
    const { engine, parsed, validation } = setup({ response: 'APPROVED', processingDelayMs: 5000, transactionTimeoutMs: 1000 });
    expect((await engine.accept({ parsed, validation, amount: 50000 })).status).toBe('TIMEOUT');
  });

  it('refuses to accept an unvalidated or invalid QR', async () => {
    const { engine, parsed, validation } = setup();
    await expect(engine.accept({ parsed, validation: undefined, amount: 1 })).rejects.toBeInstanceOf(TransactionError);
    await expect(engine.accept({ parsed, validation: { ...validation, overallStatus: 'INVALID' }, amount: 1 })).rejects.toThrow(/did not pass/);
    const other = parser.parse(generateSamplePayload());
    await expect(engine.accept({ parsed: other, validation, amount: 1 })).rejects.toThrow(/does not belong/);
  });

  it('simulates system and connection errors', async () => {
    for (const response of ['SYSTEM_ERROR', 'CONNECTION_ERROR'] as const) {
      const { engine, parsed, validation } = setup({ response, responseCode: '', responseMessage: '' });
      expect((await engine.accept({ parsed, validation, amount: 50000 })).status).toBe(response);
    }
  });

  it('authorizes through the backend processor with response mapping', async () => {
    const client = new DynamicApiClient(
      { environment: { ...cfg.environments[0], baseUrl: 'https://sim.local' }, endpoints: cfg.endpoints, app: { ...cfg.app, apiIntegrationEnabled: true } },
      undefined,
      new SimulatedBackendTransport(() => jsonResponse(200, { responseCode: '00', responseMessage: 'OK', data: { transactionStatus: 'SUCCESS', referenceNumber: 'REF9' } }), 1),
    );
    const { engine, parsed, validation } = setup({}, new BackendPaymentProcessor(client, cfg.merchant));
    const tx = await engine.accept({ parsed, validation, amount: 50000 });
    expect(tx).toMatchObject({ status: 'APPROVED', referenceNumber: 'REF9', executionMode: 'REAL_API' });
    expect(tx.backendResponse).toMatchObject({ responseCode: '00' });
  });
});

describe('Simulation scenarios', () => {
  it.each(SCENARIOS.map((s) => [s.number, s.name, s] as const))('#%i %s meets its expectation', async (_n, _name, def) => {
    const r = await runScenario(def, defaultConfig());
    expect(r.passed, r.outcome + '\n' + r.steps.map((s) => s.message).join('\n')).toBe(true);
  }, 15000);
});
