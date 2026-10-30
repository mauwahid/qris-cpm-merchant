import { describe, expect, it } from 'vitest';
import { CpmPayloadParser } from '../cpm/CpmPayloadParser';
import { corruptCrc, generateSamplePayload, SAMPLE_MPM } from '../cpm/sampleGenerator';
import { SpecificationValidator } from '../validation/SpecificationValidator';
import { BusinessRuleValidator } from '../validation/BusinessRuleValidator';
import { LocalValidationEngine } from '../validation/LocalValidationEngine';
import { ValidationOrchestrator } from '../validation/ValidationOrchestrator';
import { BackendValidationAdapter } from '../validation/BackendValidationAdapter';
import { InMemoryTransactionRepository } from '../repository/InMemoryTransactionRepository';
import { defaultConfig } from '../config/defaults';
import type { ValidationContext } from '../validation/types';
import type { Transaction, ValidationResult } from '../types';
import { DynamicApiClient } from '../api/DynamicApiClient';
import type { HttpResponse } from '../api/types';
import { jsonResponse, SimulatedBackendTransport } from '../api/SimulatedBackendTransport';
import { ascii, encodeAll, hex, cn } from '../cpm/encoder';
import { bytesToBase64 } from '../cpm/base64';

const parser = new CpmPayloadParser();
const cfg = defaultConfig();
const PAN = '9360001234567890127';

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    parsed: parser.parse(generateSamplePayload({ pan: PAN })),
    merchant: { ...cfg.merchant },
    config: { ...cfg.validation },
    amount: 50000,
    history: new InMemoryTransactionRepository(),
    ...over,
  };
}
const check = (r: ValidationResult, id: string) => r.checks.find((c) => c.id === id);
const engine = new LocalValidationEngine();

describe('SpecificationValidator', () => {
  const spec = new SpecificationValidator();
  const opts = { crcProfile: 'OPTIONAL' as const, strictMode: false };

  it('passes a well-formed CPM payload', () => {
    const checks = spec.validate(parser.parse(generateSamplePayload()), opts);
    expect(checks.filter((c) => c.status === 'FAIL')).toEqual([]);
    expect(checks.find((c) => c.id === 'TLV_STRUCTURE')?.status).toBe('PASS');
    expect(checks.find((c) => c.id === 'CRC')?.status).toBe('PASS');
  });

  it('fails on missing mandatory AID', () => {
    const checks = spec.validate(parser.parse(generateSamplePayload({ omitAid: true })), opts);
    expect(checks.find((c) => c.id === 'APPLICATION_IDENTIFIER_PRESENT')?.status).toBe('FAIL');
  });

  it('fails on missing account data', () => {
    const checks = spec.validate(parser.parse(generateSamplePayload({ omitAccount: true })), opts);
    expect(checks.find((c) => c.id === 'ACCOUNT_DATA')?.status).toBe('FAIL');
  });

  it('fails on wrong payload format indicator', () => {
    const checks = spec.validate(parser.parse(generateSamplePayload({ payloadFormatIndicator: 'CPV02' })), opts);
    expect(checks.find((c) => c.id === 'PAYLOAD_FORMAT_INDICATOR')?.status).toBe('FAIL');
  });

  it('fails CRC when corrupted and when required but absent', () => {
    expect(spec.validate(parser.parse(corruptCrc(generateSamplePayload())), opts).find((c) => c.id === 'CRC')?.status).toBe('FAIL');
    const noCrc = parser.parse(generateSamplePayload({ includeSimulatorCrc: false }));
    expect(spec.validate(noCrc, opts).find((c) => c.id === 'CRC')?.status).toBe('SKIPPED');
    expect(spec.validate(noCrc, { ...opts, crcProfile: 'REQUIRED' }).find((c) => c.id === 'CRC')?.status).toBe('FAIL');
  });

  it('rejects MPM payloads as unsupported format', () => {
    const checks = spec.validate(parser.parse(SAMPLE_MPM), opts);
    expect(checks.find((c) => c.id === 'QR_FORMAT')?.status).toBe('FAIL');
  });

  it('detects inconsistent PAN vs last-4', () => {
    const bytes = encodeAll([
      { tag: '85', value: ascii('CPV01') },
      { tag: '61', value: [{ tag: '4F', value: hex('A0000006022020') }, { tag: '5A', value: cn(PAN) }, { tag: '9F25', value: hex('9999') }] },
    ]);
    const checks = spec.validate(parser.parse(bytesToBase64(bytes)), opts);
    expect(checks.find((c) => c.id === 'ACCOUNT_CONSISTENCY')?.status).toBe('FAIL');
  });

  it('strict mode turns unknown tags into failures', () => {
    const p = parser.parse(generateSamplePayload({ extraTransparentTags: { DF55: 'X' } }));
    expect(spec.validate(p, opts).find((c) => c.id === 'UNKNOWN_TAGS')?.status).toBe('WARNING');
    expect(spec.validate(p, { ...opts, strictMode: true }).find((c) => c.id === 'UNKNOWN_TAGS')?.status).toBe('FAIL');
  });

  it('spec-mandatory rules cannot be disabled through configuration', () => {
    const c = ctx({ parsed: parser.parse(generateSamplePayload({ omitAid: true })), config: { ...cfg.validation, mandatoryTags: [], strictMode: false } });
    expect(engine.validateSync(c).overallStatus).toBe('INVALID');
  });
});

describe('LocalValidationEngine / business rules', () => {
  it('validates a good payload as VALID in LOCAL mode', () => {
    const r = engine.validateSync(ctx());
    expect(r.mode).toBe('LOCAL');
    expect(r.overallStatus).toBe('VALID');
    expect(r.summary.failed).toBe(0);
    expect(r.summary.total).toBe(r.checks.length);
  });

  it('rejects merchant IDs outside the allow list', () => {
    const r = engine.validateSync(ctx({ merchant: { ...cfg.merchant, merchantId: '999999999999999' } }));
    expect(check(r, 'MERCHANT_ID')?.status).toBe('FAIL');
    expect(r.overallStatus).toBe('INVALID');
  });

  it('accepts any merchant when allow list is empty', () => {
    const r = engine.validateSync(ctx({ merchant: { ...cfg.merchant, merchantId: '999999999999999' }, config: { ...cfg.validation, allowedMerchantIds: [] } }));
    expect(check(r, 'MERCHANT_ID')?.status).toBe('PASS');
  });

  it('fails inactive merchants', () => {
    expect(check(engine.validateSync(ctx({ merchant: { ...cfg.merchant, status: 'SUSPENDED' } })), 'MERCHANT_STATUS')?.status).toBe('FAIL');
  });

  it('validates currency support', () => {
    expect(check(engine.validateSync(ctx()), 'CURRENCY')?.status).toBe('PASS');
    const r = engine.validateSync(ctx({ config: { ...cfg.validation, supportedCurrencies: ['USD'] } }));
    expect(check(r, 'CURRENCY')?.status).toBe('FAIL');
    const r2 = engine.validateSync(ctx({ parsed: parser.parse(generateSamplePayload({ currencyNumeric: '840' })) }));
    expect(check(r2, 'CURRENCY')?.status).toBe('FAIL');
  });

  it('enforces amount limits', () => {
    expect(check(engine.validateSync(ctx({ amount: 0 })), 'AMOUNT')?.status).toBe('FAIL');
    expect(check(engine.validateSync(ctx({ amount: cfg.validation.maxAmount + 1 })), 'AMOUNT')?.status).toBe('FAIL');
    expect(check(engine.validateSync(ctx({ amount: 10.005 })), 'AMOUNT')?.status).toBe('FAIL');
  });

  it('rejects unsupported AIDs', () => {
    const r = engine.validateSync(ctx({ parsed: parser.parse(generateSamplePayload({ aid: 'A0000009999999' })) }));
    expect(check(r, 'APPLICATION_IDENTIFIER')?.status).toBe('FAIL');
  });

  it('requires configured business-mandatory tags', () => {
    const r = engine.validateSync(ctx({ parsed: parser.parse(generateSamplePayload({ includeCryptogram: false })), config: { ...cfg.validation, mandatoryTags: ['9F26'] } }));
    expect(check(r, 'MANDATORY_FIELDS')?.status).toBe('FAIL');
  });

  it('detects duplicate transactions by payload', () => {
    const c = ctx();
    const repo = new InMemoryTransactionRepository([{ transactionId: 'TRX1', status: 'APPROVED', payloadHash: c.parsed.payloadHash } as Transaction]);
    const r = engine.validateSync({ ...c, history: repo });
    expect(check(r, 'DUPLICATE')?.status).toBe('FAIL');
    // rejected attempts do not block
    const repo2 = new InMemoryTransactionRepository([{ transactionId: 'TRX1', status: 'REJECTED', payloadHash: c.parsed.payloadHash } as Transaction]);
    expect(check(engine.validateSync({ ...c, history: repo2 }), 'DUPLICATE')?.status).toBe('PASS');
    // can be disabled
    expect(check(engine.validateSync({ ...c, history: repo, config: { ...cfg.validation, duplicateDetection: false } }), 'DUPLICATE')?.status).toBe('SKIPPED');
  });

  it('checks expiry via validity window', () => {
    const r = engine.validateSync(ctx({ config: { ...cfg.validation, payloadExpirySeconds: 60 }, firstSeenAt: new Date(Date.now() - 120_000).toISOString() }));
    expect(check(r, 'EXPIRY')?.status).toBe('FAIL');
  });

  it('checks expiry via configured tag', () => {
    const p = new CpmPayloadParser({ expiryTag: 'DF20' }).parse(generateSamplePayload({ extraTransparentTags: { DF20: '200101000000' } }));
    const r = engine.validateSync(ctx({ parsed: p, config: { ...cfg.validation, expiryTag: 'DF20' } }));
    expect(check(r, 'EXPIRY')?.status).toBe('FAIL');
  });

  it('skips business rules when payload structure fails', () => {
    const r = engine.validateSync(ctx({ parsed: parser.parse('garbage!!') }));
    expect(r.overallStatus).toBe('INVALID');
    expect(check(r, 'BUSINESS_RULES')?.status).toBe('SKIPPED');
  });

  it('uses the business validator independently', () => {
    const checks = new BusinessRuleValidator().validate(ctx());
    expect(checks.every((c) => c.category === 'BUSINESS')).toBe(true);
  });
});

describe('ValidationOrchestrator', () => {
  const backendClient = (handler: (url: string) => HttpResponse) =>
    new DynamicApiClient(
      { environment: { ...cfg.environments[0], baseUrl: 'https://sim.local' }, endpoints: cfg.endpoints, app: { ...cfg.app, apiIntegrationEnabled: true } },
      undefined,
      new SimulatedBackendTransport((req) => handler(req.url), 1),
    );

  it('uses LOCAL mode when API integration is disabled and never calls the backend', async () => {
    let called = false;
    const backend = { validate: async () => { called = true; throw new Error('should not be called'); } };
    const o = new ValidationOrchestrator(engine, backend, { apiIntegrationEnabled: false, fallbackToLocal: false });
    const r = await o.validate(ctx());
    expect(r.mode).toBe('LOCAL');
    expect(called).toBe(false);
  });

  it('uses BACKEND mode and maps a successful backend response', async () => {
    const client = backendClient(() => jsonResponse(200, { responseCode: '00', responseMessage: 'OK', data: { validationStatus: 'VALID', checks: [{ name: 'Token', status: 'PASS' }] } }));
    const o = new ValidationOrchestrator(engine, new BackendValidationAdapter(client), { apiIntegrationEnabled: true, fallbackToLocal: false });
    const r = await o.validate(ctx());
    expect(r.mode).toBe('BACKEND');
    expect(r.overallStatus).toBe('VALID');
    expect(r.checks.some((c) => c.name === 'Token')).toBe(true);
  });

  it('reports backend rejection as INVALID', async () => {
    const client = backendClient(() => jsonResponse(200, { responseCode: '14', responseMessage: 'Invalid account', data: { validationStatus: 'INVALID' } }));
    const r = await new ValidationOrchestrator(engine, new BackendValidationAdapter(client), { apiIntegrationEnabled: true, fallbackToLocal: true }).validate(ctx());
    expect(r.overallStatus).toBe('INVALID');
    expect(r.fallbackUsed).toBeFalsy();
  });

  it('returns an error result when the backend is unavailable and fallback is off', async () => {
    const client = backendClient(() => { throw new TypeError('Failed to fetch'); });
    const r = await new ValidationOrchestrator(engine, new BackendValidationAdapter(client), { apiIntegrationEnabled: true, fallbackToLocal: false }).validate(ctx());
    expect(r.overallStatus).toBe('INVALID');
    expect(check(r, 'BACKEND_AVAILABILITY')?.status).toBe('FAIL');
  });

  it('falls back to local validation when allowed', async () => {
    const client = backendClient(() => { throw new TypeError('Failed to fetch'); });
    const r = await new ValidationOrchestrator(engine, new BackendValidationAdapter(client), { apiIntegrationEnabled: true, fallbackToLocal: true }).validate(ctx());
    expect(r.fallbackUsed).toBe(true);
    expect(r.mode).toBe('LOCAL');
    expect(r.overallStatus).toBe('VALID');
    expect(check(r, 'BACKEND_FALLBACK')?.status).toBe('WARNING');
  });
});
