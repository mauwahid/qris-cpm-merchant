import type { HttpRequest, HttpResponse, HttpTransport } from './types';

export type SimulatedHandler = (req: HttpRequest) => HttpResponse | Promise<HttpResponse>;

/**
 * In-browser fake backend used by simulation scenarios and tests.
 * It never performs network I/O, so it is permitted even while API integration is disabled.
 */
export class SimulatedBackendTransport implements HttpTransport {
  readonly simulated = true;
  constructor(private readonly handler: SimulatedHandler, private readonly latencyMs = 50) {}

  async send(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, this.latencyMs);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    return this.handler(req);
  }
}

export const jsonResponse = (status: number, body: unknown, statusText = ''): HttpResponse => ({
  status,
  statusText,
  headers: { 'content-type': 'application/json' },
  bodyText: typeof body === 'string' ? body : JSON.stringify(body),
});
