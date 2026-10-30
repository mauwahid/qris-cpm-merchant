const B64_RE = /^[A-Za-z0-9+/\-_]+={0,2}$/;

export function isBase64Like(text: string): boolean {
  return text.length > 0 && B64_RE.test(text);
}

/** Decodes standard or URL-safe Base64. Throws on invalid input. */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!isBase64Like(clean)) throw new Error('Payload contains characters outside the Base64 alphabet');
  const rem = clean.replace(/=+$/, '').length % 4;
  if (rem === 1) throw new Error('Invalid Base64 length');
  const padded = clean.replace(/=+$/, '') + (rem === 0 ? '' : '='.repeat(4 - rem));
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
