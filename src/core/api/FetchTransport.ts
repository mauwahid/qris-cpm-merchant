import type { HttpRequest, HttpResponse, HttpTransport } from './types';

export class FetchTransport implements HttpTransport {
  readonly simulated = false;

  async send(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, statusText: res.statusText, headers, bodyText: await res.text() };
  }
}
