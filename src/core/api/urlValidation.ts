export interface UrlCheck {
  valid: boolean;
  error?: string;
  warnings: string[];
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/i;

/** Validates a backend base URL entered by the user. */
export function validateBaseUrl(input: string): UrlCheck {
  const warnings: string[] = [];
  const value = (input ?? '').trim();
  if (!value) return { valid: false, error: 'Base URL is required', warnings };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, error: 'Base URL is not a valid absolute URL (e.g. https://api.example.com)', warnings };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, error: `Unsupported protocol "${url.protocol}". Use http or https.`, warnings };
  }
  if (url.username || url.password) {
    return { valid: false, error: 'Do not embed credentials in the URL. Use the Authentication settings instead.', warnings };
  }
  if (url.search || url.hash) warnings.push('Query string / fragment in the base URL will be ignored.');
  if (url.protocol === 'http:' && !LOCAL_HOSTS.test(url.hostname)) {
    warnings.push('Plain HTTP to a non-local host: credentials and payloads are sent unencrypted.');
  }
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.protocol === 'http:') {
    warnings.push('The app is served over HTTPS; the browser will block HTTP requests (mixed content).');
  }
  return { valid: true, warnings };
}

export function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!path) return b;
  return `${b}/${path.replace(/^\/+/, '')}`;
}
