import type { ApiEnvironment, KeyValue } from '../config/types';

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Authentication provider: produces headers for the configured authentication type. */
export function buildAuthHeaders(env: ApiEnvironment): Record<string, string> {
  switch (env.authType) {
    case 'BEARER':
      return env.bearerToken ? { Authorization: `Bearer ${env.bearerToken}` } : {};
    case 'BASIC':
      return env.basicUsername || env.basicPassword
        ? { Authorization: `Basic ${utf8Base64(`${env.basicUsername}:${env.basicPassword}`)}` }
        : {};
    case 'API_KEY':
      return env.apiKey ? { [env.apiKeyHeaderName || 'X-API-Key']: env.apiKey } : {};
    case 'CUSTOM_HEADER':
      return env.customAuthHeaderName ? { [env.customAuthHeaderName]: env.customAuthHeaderValue } : {};
    case 'NONE':
    default:
      return {};
  }
}

export function keyValuesToRecord(list: KeyValue[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of list ?? []) if (kv.enabled && kv.key.trim()) out[kv.key.trim()] = kv.value;
  return out;
}

/** Header names that browsers forbid scripts from setting. */
export const FORBIDDEN_HEADERS = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method',
  'connection', 'content-length', 'cookie', 'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin',
  'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
]);
