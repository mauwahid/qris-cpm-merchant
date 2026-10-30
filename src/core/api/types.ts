import type { ApiEnvironment, AppSettings, EndpointConfig, HttpMethod } from '../config/types';
import type { ApiLogEntry } from '../types';

export interface HttpRequest {
  method: HttpMethod | string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
}

/** Abstraction over the network so tests and simulation scenarios can inject fake backends. */
export interface HttpTransport {
  /** Simulated transports never leave the browser; they are allowed even when integration is disabled. */
  readonly simulated?: boolean;
  send(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
}

export type ApiErrorType = 'DISABLED' | 'INVALID_URL' | 'TIMEOUT' | 'NETWORK' | 'ABORTED' | 'TEMPLATE';

export interface ApiCallResult {
  ok: boolean; // HTTP 2xx and no transport error
  request: HttpRequest;
  /** URL displayed to the user (real target, even when routed through the dev proxy). */
  displayUrl: string;
  response?: HttpResponse;
  json?: unknown;
  jsonError?: string;
  durationMs: number;
  error?: { type: ApiErrorType; message: string };
  logId?: string;
  templateWarnings: string[];
}

export interface ApiLogSink {
  add(entry: ApiLogEntry): void;
}

export interface ApiClientContext {
  environment: ApiEnvironment;
  endpoints: EndpointConfig[];
  app: Pick<AppSettings, 'apiIntegrationEnabled' | 'maskSensitiveInLogs' | 'sensitiveHeaderNames'>;
}
