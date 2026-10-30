import { bytesToBase64 } from './base64';
import { appendSimulatorCrc, ascii, cn, encodeAll, hex, n, type TlvSpec } from './encoder';
import { randomHex } from '../util/id';
import { asciiToBytes } from '../util/hex';
import { crc16Hex } from './crc16';
import { SIMULATOR_DEFAULT_AID } from '../config/defaults';

/**
 * Generates SIMULATED EMVCo CPM payloads for testing.
 *
 * ⚠ These are NOT official or ASPI-certified QRIS CPM payloads. The structure follows the public
 * EMVCo CPM data object layout; the AID, PAN and cryptogram values are random/simulated and
 * cannot be authorised by any real issuer.
 */
export interface SampleOptions {
  aid?: string;
  pan?: string;
  cardholderName?: string;
  applicationLabel?: string;
  includeTrack2?: boolean;
  includeCryptogram?: boolean;
  includeSimulatorCrc?: boolean;
  /** EMV terminal data objects some issuers embed (optional, for parser coverage). */
  amount?: number;
  currencyNumeric?: string;
  /** Proprietary extra tags (hex tag → ascii value) placed in tag 63. */
  extraTransparentTags?: Record<string, string>;
  extraRootTags?: TlvSpec[];
  payloadFormatIndicator?: string;
  omitAid?: boolean;
  omitAccount?: boolean;
}

function luhnCheckDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function randomSimulatedPan(): string {
  // 9360 prefix resembles Indonesian national numbering, but this PAN is random & simulated.
  let body = '9360';
  while (body.length < 18) body += Math.floor(Math.random() * 10);
  return body + luhnCheckDigit(body);
}

export function buildSampleSpecs(o: SampleOptions = {}): TlvSpec[] {
  const pan = o.pan ?? randomSimulatedPan();
  const app: TlvSpec[] = [];
  if (!o.omitAid) app.push({ tag: '4F', value: hex(o.aid ?? SIMULATOR_DEFAULT_AID) });
  app.push({ tag: '50', value: ascii(o.applicationLabel ?? 'SIMULATED QRIS') });
  if (!o.omitAccount) {
    if (o.includeTrack2) app.push({ tag: '57', value: cn(`${pan}D3012201${randomHex(4).replace(/[A-F]/g, '0')}`) });
    app.push({ tag: '5A', value: cn(pan) });
  }
  app.push({ tag: '5F20', value: ascii((o.cardholderName ?? 'SIMULATED CUSTOMER').slice(0, 26)) });
  app.push({ tag: '5F2D', value: ascii('idenen') });
  app.push({ tag: '9F25', value: n(pan.slice(-4), 2) });

  const transparent: TlvSpec[] = [];
  if (o.includeCryptogram ?? true) {
    transparent.push(
      { tag: '9F26', value: hex(randomHex(8)) },
      { tag: '9F27', value: hex('80') },
      { tag: '9F10', value: hex('0110A00003220000000000000000000000FF') },
      { tag: '9F36', value: hex(randomHex(2)) },
      { tag: '82', value: hex('1980') },
      { tag: '9F37', value: hex(randomHex(4)) },
    );
  }
  if (o.amount !== undefined) transparent.push({ tag: '9F02', value: n(String(Math.round(o.amount * 100)), 6) });
  if (o.currencyNumeric) transparent.push({ tag: '5F2A', value: n(o.currencyNumeric, 2) });
  for (const [tag, value] of Object.entries(o.extraTransparentTags ?? {})) transparent.push({ tag, value: ascii(value) });
  if (transparent.length) app.push({ tag: '63', value: transparent });

  return [{ tag: '85', value: ascii(o.payloadFormatIndicator ?? 'CPV01') }, { tag: '61', value: app }, ...(o.extraRootTags ?? [])];
}

export function generateSampleBytes(o: SampleOptions = {}): Uint8Array {
  const bytes = encodeAll(buildSampleSpecs(o));
  return o.includeSimulatorCrc ?? true ? appendSimulatorCrc(bytes) : bytes;
}

export function generateSamplePayload(o: SampleOptions = {}): string {
  return bytesToBase64(generateSampleBytes(o));
}

/** Corrupts the CRC of a payload generated with the simulator CRC (flips the last byte). */
export function corruptCrc(base64: string): string {
  const bin = atob(base64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  bytes[bytes.length - 1] ^= 0xff;
  return bytesToBase64(bytes);
}

/** Produces a structurally broken payload (declared length larger than the data). */
export function malformedPayload(): string {
  const bytes = generateSampleBytes({ includeSimulatorCrc: false });
  // Truncate the payload so that the Application Template length overruns.
  return bytesToBase64(bytes.slice(0, bytes.length - 12));
}

/** A static, documented sample (simulation data). */
export const STATIC_SAMPLES: { id: string; label: string; description: string; build: () => string }[] = [
  { id: 'basic', label: 'Basic CPM (PAN + cryptogram)', description: 'PFI CPV01, AID, label, PAN, cardholder, tag 63 cryptogram data, simulator CRC', build: () => generateSamplePayload() },
  { id: 'track2', label: 'CPM with Track 2', description: 'Includes Track 2 Equivalent Data (57) in addition to PAN', build: () => generateSamplePayload({ includeTrack2: true }) },
  { id: 'no-crc', label: 'CPM without simulator CRC', description: 'Pure EMVCo layout, no non-standard CRC tag', build: () => generateSamplePayload({ includeSimulatorCrc: false }) },
  { id: 'with-amount', label: 'CPM with amount (9F02/5F2A)', description: 'Embeds EMV amount & currency data objects in tag 63', build: () => generateSamplePayload({ amount: 75000, currencyNumeric: '360' }) },
  { id: 'unknown-aid', label: 'Unsupported AID', description: 'AID not in the supported list', build: () => generateSamplePayload({ aid: 'A0000009999999' }) },
  { id: 'missing-aid', label: 'Missing AID (4F)', description: 'Application Template without ADF Name', build: () => generateSamplePayload({ omitAid: true }) },
  { id: 'bad-crc', label: 'Invalid simulator CRC', description: 'CRC value does not match payload', build: () => corruptCrc(generateSamplePayload()) },
  { id: 'malformed', label: 'Malformed TLV', description: 'Truncated payload — TLV length overflow', build: () => malformedPayload() },
  { id: 'mpm', label: 'QRIS MPM (wrong mode)', description: 'Merchant-presented payload; must be rejected by a CPM terminal', build: () => SAMPLE_MPM },
];

const mpm = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`;

/** Simulated EMVCo MPM payload with a correct CRC (used to test the "unsupported format" path). */
export const SAMPLE_MPM = (() => {
  const body =
    mpm('00', '01') +
    mpm('01', '12') +
    mpm('26', mpm('00', 'ID.SIMULATOR.WWW') + mpm('01', '9360000000000000001')) +
    mpm('52', '5411') +
    mpm('53', '360') +
    mpm('58', 'ID') +
    mpm('59', 'SIMULATED MPM MERCHANT') +
    mpm('60', 'JAKARTA') +
    '6304';
  return body + crc16Hex(asciiToBytes(body));
})();
