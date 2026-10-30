import type { EndpointConfig } from '../config/types';
import type { ApiLogEntry } from '../types';
import { buildAuthHeaders, FORBIDDEN_HEADERS, keyValuesToRecord } from './auth';
import { renderPath, renderTemplate, type TemplateVars } from './template';
import { joinUrl, validateBaseUrl } from './urlValidation';
import type { ApiCallResult, ApiClientContext, ApiLogSink, HttpRequest, HttpTransport } from './types';
import { FetchTransport } from './FetchTransport';
import { maskHeaders, maskJsonBody } from '../util/mask';
import { uuid } from '../util/id';

export const DEV_PROXY_PREFIX = '/__devproxy';
export const DEV_PROXY_TARGET_HEADER = 'x-devproxy-target';

export class ApiDisabledError extends Error {
  constructor() {
    super('API integration is disabled. The simulator is running in standalone local mode; no HTTP request was sent.');
    this.name = 'ApiDisabledError';
  }
}

export interface CallMeta {
  transactionId?: string;
  endpoint?: EndpointConfig;
}

/**
 * Dynamic API client. Everything (base URL, auth, headers, endpoints, timeouts) is read from the
 * configuration supplied at construction, so creating a new client per call guarantees the
 * currently active environment is used for every subsequent request.
 */
export class DynamicApiClient {
  constructor(
    private readonly ctx: ApiClientContext,
    private readonly logSink?: ApiLogSink,
    private readonly transport: HttpTransport = new FetchTransport(),
  ) {}

  get environment() {
    return this.ctx.environment;
  }

  findEndpoint(idOrRole: string): EndpointConfig | undefined {
    return this.ctx.endpoints.find((e) => e.id === idOrRole) ?? this.ctx.endpoints.find((e) => e.role === idOrRole);
  }

  /** Base headers = custom environment headers + authentication headers. */
  baseHeaders(): Record<string, string> {
    return { ...keyValuesToRecord(this.ctx.environment.customHeaders), ...buildAuthHeaders(this.ctx.environment) };
  }

  /** Builds a request from an endpoint definition and template variables. */
  buildRequest(endpoint: EndpointConfig, vars: TemplateVars): { request: HttpRequest; warnings: string[] } {
    const env = this.ctx.environment;
    const allVars: TemplateVars = { apiVersion: env.apiVersion, environment: env.name, ...vars };
    const path = renderPath(endpoint.path, allVars);
    const hasBody = endpoint.method !== 'GET' && endpoint.bodyTemplate.trim() !== '';
    const body = hasBody ? renderTemplate(endpoint.bodyTemplate, allVars, 'json') : { output: undefined, missing: [] };
    const headers: Record<string, string> = { Accept: 'application/json', ...this.baseHeaders() };
    for (const [k, v] of Object.entries(keyValuesToRecord(endpoint.headers))) headers[k] = renderTemplate(v, allVars).output;
    const warnings = [...path.missing, ...body.missing].map((m) => `Unresolved placeholder {{${m}}}`);
    return {
      request: {
        method: endpoint.method,
        url: joinUrl(env.baseUrl, path.output),
        headers,
        body: body.output,
        timeoutMs: endpoint.timeoutMs || env.timeoutMs || 15000,
      },
      warnings,
    };
  }

  async callEndpoint(idOrRole: string, vars: TemplateVars, meta: CallMeta = {}): Promise<ApiCallResult> {
    const endpoint = this.findEndpoint(idOrRole);
    if (!endpoint) {
      const request: HttpRequest = { method: 'GET', url: '', headers: {}, timeoutMs: 0 };
      return { ok: false, request, displayUrl: '', durationMs: 0, templateWarnings: [], error: { type: 'TEMPLATE', message: `Endpoint "${idOrRole}" is not configured` } };
    }
    const { request, warnings } = this.buildRequest(endpoint, vars);
    const result = await this.send(request, { ...meta, endpoint });
    result.templateWarnings = warnings;
    return result;
  }

  /** Sends a fully built request. Enforces the API integration switch. */
  async send(request: HttpRequest, meta: CallMeta = {}): Promise<ApiCallResult> {
    const base: ApiCallResult = { ok: false, request, displayUrl: request.url, durationMs: 0, templateWarnings: [] };

    if (!this.ctx.app.apiIntegrationEnabled && !this.transport.simulated) {
      return { ...base, error: { type: 'DISABLED', message: new ApiDisabledError().message } };
    }

    const urlCheck = validateBaseUrl(request.url);
    if (!urlCheck.valid) {
      const res: ApiCallResult = { ...base, error: { type: 'INVALID_URL', message: urlCheck.error ?? 'Invalid URL' } };
      res.logId = this.log(request, res, meta);
      return res;
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers)) if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) headers[k] = v;
    let wire: HttpRequest = { ...request, headers };
    if (this.ctx.environment.useDevProxy && !this.transport.simulated) {
      const u = new URL(request.url);
      wire = {
        ...wire,
        url: `${DEV_PROXY_PREFIX}${u.pathname}${u.search}`,
        headers: { ...headers, [DEV_PROXY_TARGET_HEADER]: u.origin },
      };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);
    const started = performance.now();
    let result: ApiCallResult;
    try {
      const response = await this.transport.send(wire, controller.signal);
      const durationMs = Math.round(performance.now() - started);
      result = { ...base, response, durationMs, ok: response.status >= 200 && response.status < 300 };
      if (response.bodyText.trim()) {
        try {
          result.json = JSON.parse(response.bodyText);
        } catch (e) {
          result.jsonError = `Response body is not valid JSON: ${(e as Error).message}`;
        }
      }
    } catch (e) {
      const durationMs = Math.round(performance.now() - started);
      const err = e as Error;
      if (timedOut) {
        result = { ...base, durationMs, error: { type: 'TIMEOUT', message: `Request timed out after ${request.timeoutMs} ms` } };
      } else if (err.name === 'AbortError') {
        result = { ...base, durationMs, error: { type: 'ABORTED', message: 'Request aborted' } };
      } else {
        result = {
          ...base,
          durationMs,
          error: {
            type: 'NETWORK',
            message: `Network error: ${err.message}. Possible causes: backend offline, DNS failure, CORS not allowed by the backend, mixed content (HTTPS → HTTP) or an untrusted TLS certificate.`,
          },
        };
      }
    } finally {
      clearTimeout(timer);
    }
    result.logId = this.log(request, result, meta);
    return result;
  }

  private log(request: HttpRequest, result: ApiCallResult, meta: CallMeta): string {
    const id = uuid();
    if (!this.logSink) return id;
    const mask = this.ctx.app.maskSensitiveInLogs;
    const entry: ApiLogEntry = {
      id,
      timestamp: new Date().toISOString(),
      environment: this.ctx.environment.name,
      endpointId: meta.endpoint?.id,
      endpointName: meta.endpoint?.name,
      method: String(request.method),
      url: request.url,
      requestHeaders: mask ? maskHeaders(request.headers, this.ctx.app.sensitiveHeaderNames) : request.headers,
      requestBody: mask ? maskJsonBody(request.body) : request.body,
      status: result.response?.status,
      responseHeaders: result.response?.headers,
      responseBody: mask ? maskJsonBody(result.response?.bodyText) : result.response?.bodyText,
      durationMs: result.durationMs,
      success: result.ok,
      errorMessage: result.error?.message ?? (result.response && !result.ok ? `HTTP ${result.response.status} ${result.response.statusText}` : undefined),
      transactionId: meta.transactionId,
      simulated: this.transport.simulated,
    };
    this.logSink.add(entry);
    return id;
  }
}
