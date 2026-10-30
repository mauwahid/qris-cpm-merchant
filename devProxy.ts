import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Development-only CORS proxy.
 *
 * The browser sends requests to `/__devproxy/<path>` together with the header
 * `x-devproxy-target: <base url>`. The Vite dev server forwards the request to
 * `<base url>/<path>` server-side, which avoids CORS restrictions while testing
 * against backends that do not (yet) send CORS headers.
 *
 * This plugin is only registered by `vite` (dev server) and is never part of a
 * production build. It does not disable TLS verification.
 */
export const DEV_PROXY_PREFIX = '/__devproxy';
const TARGET_HEADER = 'x-devproxy-target';
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'host', 'content-length', 'origin', 'referer', TARGET_HEADER,
]);

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function devProxyPlugin(): Plugin {
  return {
    name: 'cpm-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url || !req.url.startsWith(DEV_PROXY_PREFIX)) return next();
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        const target = req.headers[TARGET_HEADER];
        if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `Missing or invalid ${TARGET_HEADER} header` }));
          return;
        }
        const path = req.url.slice(DEV_PROXY_PREFIX.length) || '/';
        const url = target.replace(/\/+$/, '') + path;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (!HOP_BY_HOP.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v;
        }
        try {
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
          const upstream = await fetch(url, { method: req.method, headers, body });
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (!HOP_BY_HOP.has(key) && key !== 'content-encoding') res.setHeader(key, value);
          });
          res.setHeader('x-devproxy-upstream', url);
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Dev proxy could not reach upstream', detail: String(err) }));
        }
      });
    },
  };
}
