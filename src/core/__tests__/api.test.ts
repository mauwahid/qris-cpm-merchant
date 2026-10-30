import { describe, expect, it, vi } from 'vitest';
import { DynamicApiClient } from '../api/DynamicApiClient';
import type { HttpRequest, HttpResponse, HttpTransport } from '../api/types';
import { jsonResponse } from '../api/SimulatedBackendTransport';
import { buildAuthHeaders } from '../api/auth';
import { renderPath, renderTemplate } from '../api/template';
import { getByPath } from '../api/jsonPath';
import { mapApiResponse } from '../api/ResponseMapper';
import { validateBaseUrl } from '../api/urlValidation';
import { defaultConfig, defaultMapping } from '../config/defaults';
import type { ApiEnvironment } from '../config/types';
import type { ApiLogEntry } from '../types';

const cfg = defaultConfig();
const env = (p: Partial<ApiEnvironment> = {}): ApiEnvironment => ({ ...cfg.environments[0], baseUrl: 'https://sit-api.example.com', ...p });

/** Records requests; behaves like a real (non-simulated) network transport. */
class RecordingTransport implements HttpTransport {
  readonly simulated = false;
  requests: HttpRequest[] = [];
  constructor(private readonly respond: (req: HttpRequest, signal: AbortSignal) => Promise<HttpResponse> | HttpResponse = () => jsonResponse(200, { responseCode: '00' })) {}
  async send(req: HttpRequest, signal: AbortSignal) {
    this.requests.push(req);
    return this.respond(req, signal);
  }
}

function client(e: ApiEnvironment, t: HttpTransport, enabled = true, logs: ApiLogEntry[] = []) {
  return new DynamicApiClient({ environment: e, endpoints: cfg.endpoints, app: { ...cfg.app, apiIntegrationEnabled: enabled } }, { add: (l) => logs.push(l) }, t);
}

const vars = { transactionId: 'TRX1', merchantId: 'M1', terminalId: 'T1', amount: 1500.5, currency: 'IDR', qrPayload: 'hQVDUFYwMQ==', timestamp: '2026-01-01T00:00:00Z' };

describe('DynamicApiClient', () => {
  it('uses the dynamic base URL of the active environment', async () => {
    const t = new RecordingTransport();
    await client(env({ baseUrl: 'https://uat-api.example.com/' }), t).callEndpoint('PAYMENT', vars);
    await client(env({ baseUrl: 'http://localhost:8080' }), t).callEndpoint('PAYMENT', vars);
    expect(t.requests[0].url).toBe('https://uat-api.example.com/api/v1/merchant/payment');
    expect(t.requests[1].url).toBe('http://localhost:8080/api/v1/merchant/payment');
  });

  it('sends no HTTP request when API integration is disabled', async () => {
    const t = new RecordingTransport();
    const r = await client(env(), t, false).callEndpoint('PAYMENT', vars);
    expect(t.requests).toHaveLength(0);
    expect(r.error?.type).toBe('DISABLED');
  });

  it('applies bearer, basic, api key and custom header authentication', () => {
    expect(buildAuthHeaders(env({ authType: 'BEARER', bearerToken: 'abc' }))).toEqual({ Authorization: 'Bearer abc' });
    expect(buildAuthHeaders(env({ authType: 'BASIC', basicUsername: 'user', basicPassword: 'pass' }))).toEqual({ Authorization: `Basic ${btoa('user:pass')}` });
    expect(buildAuthHeaders(env({ authType: 'API_KEY', apiKey: 'k1', apiKeyHeaderName: 'X-Key' }))).toEqual({ 'X-Key': 'k1' });
    expect(buildAuthHeaders(env({ authType: 'CUSTOM_HEADER', customAuthHeaderName: 'X-Sig', customAuthHeaderValue: 's' }))).toEqual({ 'X-Sig': 's' });
    expect(buildAuthHeaders(env({ authType: 'NONE', bearerToken: 'ignored' }))).toEqual({});
  });

  it('sends authentication and custom headers on requests', async () => {
    const t = new RecordingTransport();
    const e = env({ authType: 'BEARER', bearerToken: 'tok', customHeaders: [{ key: 'X-Channel', value: 'POS', enabled: true }, { key: 'X-Off', value: 'no', enabled: false }] });
    await client(e, t).callEndpoint('PAYMENT', vars);
    const h = t.requests[0].headers;
    expect(h.Authorization).toBe('Bearer tok');
    expect(h['X-Channel']).toBe('POS');
    expect(h['X-Off']).toBeUndefined();
    expect(h['Content-Type']).toBe('application/json');
  });

  it('masks sensitive headers in API logs', async () => {
    const logs: ApiLogEntry[] = [];
    await client(env({ authType: 'BEARER', bearerToken: 'supersecrettoken' }), new RecordingTransport(), true, logs).callEndpoint('PAYMENT', vars);
    expect(logs[0].requestHeaders.Authorization).not.toContain('supersecrettoken');
    expect(logs[0].success).toBe(true);
  });

  it('renders the request body template with placeholders', async () => {
    const t = new RecordingTransport();
    await client(env(), t).callEndpoint('PAYMENT', vars);
    const body = JSON.parse(t.requests[0].body!);
    expect(body).toMatchObject({ transactionId: 'TRX1', merchantId: 'M1', terminalId: 'T1', amount: 1500.5, currency: 'IDR', qrPayload: 'hQVDUFYwMQ==' });
  });

  it('substitutes REST path parameters', async () => {
    const t = new RecordingTransport();
    await client(env(), t).callEndpoint('STATUS', vars);
    expect(t.requests[0].url).toBe('https://sit-api.example.com/api/v1/merchant/transaction/TRX1');
    expect(t.requests[0].method).toBe('GET');
    expect(t.requests[0].body).toBeUndefined();
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();
    const t = new RecordingTransport((_req, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const p = client(env({ timeoutMs: 1000 }), t).callEndpoint('PAYMENT', vars);
    await vi.advanceTimersByTimeAsync(1100);
    const r = await p;
    vi.useRealTimers();
    expect(r.error?.type).toBe('TIMEOUT');
    expect(mapApiResponse(defaultMapping(), r).status).toBe('TIMEOUT');
  });

  it('reports network errors as connection errors', async () => {
    const r = await client(env(), new RecordingTransport(() => { throw new TypeError('Failed to fetch'); })).callEndpoint('PAYMENT', vars);
    expect(r.error?.type).toBe('NETWORK');
    expect(mapApiResponse(defaultMapping(), r).status).toBe('CONNECTION_ERROR');
  });

  it('rejects invalid URLs without sending', async () => {
    const t = new RecordingTransport();
    const r = await client(env({ baseUrl: 'ftp://x' }), t).callEndpoint('PAYMENT', vars);
    expect(r.error?.type).toBe('INVALID_URL');
    expect(t.requests).toHaveLength(0);
  });

  it('routes through the dev proxy when enabled', async () => {
    const t = new RecordingTransport();
    await client(env({ useDevProxy: true }), t).callEndpoint('PAYMENT', vars);
    expect(t.requests[0].url).toBe('/__devproxy/api/v1/merchant/payment');
    expect(t.requests[0].headers['x-devproxy-target']).toBe('https://sit-api.example.com');
  });
});

describe('Templates & JSONPath', () => {
  it('escapes JSON string values', () => {
    const r = renderTemplate('{"n":"{{merchantName}}"}', { merchantName: 'A "quoted" \\ name' }, 'json');
    expect(JSON.parse(r.output).n).toBe('A "quoted" \\ name');
  });
  it('reports missing placeholders', () => {
    expect(renderTemplate('{{foo}} {{amount}}', { amount: 1 }).missing).toEqual(['foo']);
    expect(renderPath('/tx/{transactionId}/{{x}}', { transactionId: 'a b' }).output).toBe('/tx/a%20b/{{x}}');
  });
  it('resolves JSONPath expressions', () => {
    const o = { a: { b: [{ c: 1 }, { c: 2 }] }, 'x-y': 'z' };
    expect(getByPath(o, '$.a.b[1].c').value).toBe(2);
    expect(getByPath(o, '$.a.b[-1].c').value).toBe(2);
    expect(getByPath(o, "$['x-y']").value).toBe('z');
    expect(getByPath(o, '$.a.missing').found).toBe(false);
    expect(getByPath(o, 'bad').found).toBe(false);
  });
});

describe('Response mapping', () => {
  const res = (status: number, body: unknown) => {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
    let json: unknown;
    let jsonError: string | undefined;
    try { json = JSON.parse(bodyText); } catch (e) { jsonError = String(e); }
    return { ok: status < 300, request: { method: 'POST', url: '', headers: {}, timeoutMs: 0 }, displayUrl: '', response: { status, statusText: '', headers: {}, bodyText }, json, jsonError, durationMs: 1, templateWarnings: [] };
  };

  it('maps a success response', () => {
    const m = mapApiResponse(defaultMapping(), res(200, { responseCode: '00', responseMessage: 'Approved', data: { transactionStatus: 'SUCCESS', referenceNumber: 'R1' } }));
    expect(m).toMatchObject({ status: 'APPROVED', success: true, responseCode: '00', responseMessage: 'Approved', referenceNumber: 'R1' });
  });
  it('maps a decline with error code mapping', () => {
    const m = mapApiResponse(defaultMapping(), res(200, { responseCode: '51' }));
    expect(m.status).toBe('DECLINED');
    expect(m.responseMessage).toBe('Insufficient funds');
  });
  it('maps custom response structures', () => {
    const mapping = { ...defaultMapping(), responseCodePath: '$.result.rc', responseMessagePath: '$.result.msg', transactionStatusPath: '$.result.state', successCodes: ['0000'], statusMapping: { OK: 'APPROVED' as const } };
    expect(mapApiResponse(mapping, res(200, { result: { rc: '0000', msg: 'fine', state: 'OK' } })).status).toBe('APPROVED');
  });
  it('maps HTTP 5xx to SYSTEM_ERROR', () => {
    expect(mapApiResponse(defaultMapping(), res(500, { responseCode: '96' })).status).toBe('SYSTEM_ERROR');
    expect(mapApiResponse(defaultMapping(), res(502, '<html>Bad gateway</html>')).status).toBe('SYSTEM_ERROR');
  });
  it('reports MAPPING_ERROR when fields are missing or body is not JSON', () => {
    expect(mapApiResponse(defaultMapping(), res(200, { foo: 'bar' })).status).toBe('MAPPING_ERROR');
    expect(mapApiResponse(defaultMapping(), res(200, 'not json')).status).toBe('MAPPING_ERROR');
  });
  it('does not approve when status says success but code is not a success code', () => {
    expect(mapApiResponse(defaultMapping(), res(200, { responseCode: '05', data: { transactionStatus: 'SUCCESS' } })).status).toBe('DECLINED');
  });
});

describe('URL validation', () => {
  it('validates base URLs', () => {
    expect(validateBaseUrl('https://api.example.com').valid).toBe(true);
    expect(validateBaseUrl('').valid).toBe(false);
    expect(validateBaseUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateBaseUrl('https://user:pw@api.example.com').valid).toBe(false);
    expect(validateBaseUrl('http://api.example.com').warnings.length).toBeGreaterThan(0);
    expect(validateBaseUrl('http://localhost:8080').warnings).toEqual([]);
  });
});
