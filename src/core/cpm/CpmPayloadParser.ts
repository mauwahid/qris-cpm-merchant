import type { CpmFields, ParsedQr, ParseIssue, PayloadEncoding, QrFormat, QrParser, TlvNode } from '../types';
import { parseBerTlv, TlvError, type RawTlv } from './berTlv';
import { base64ToBytes, isBase64Like } from './base64';
import { bytesToAscii, bytesToHex, isPrintableAscii } from '../util/hex';
import { hashString } from '../util/hash';
import { crc16Hex } from './crc16';
import { getTagDefinition, SIMULATOR_CRC_TAG, type DataFormat } from './tags';
import { CURRENCIES, COUNTRIES } from '../config/defaults';
import { maskPan, maskTrack2 } from '../util/mask';

export interface CpmParserOptions {
  /** Optional tag carrying a transaction reference (configure per ASPI spec). */
  transactionReferenceTag?: string;
  /** Optional tag carrying a payload expiry timestamp (configure per ASPI spec). */
  expiryTag?: string;
  /** Maximum accepted raw payload size (characters). */
  maxPayloadLength?: number;
}

const MAX_DEFAULT = 4096;

function emptyFields(): CpmFields {
  return { applications: [], additionalData: {}, crc: { present: false, tag: SIMULATOR_CRC_TAG } };
}

export function luhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Decodes a BCD / compressed numeric value. Returns undefined if any nibble is not a digit (or trailing F for cn). */
export function decodeNumeric(hex: string, format: 'n' | 'cn'): string | undefined {
  if (format === 'cn') {
    const trimmed = hex.replace(/F+$/i, '');
    return /^\d*$/.test(trimmed) ? trimmed : undefined;
  }
  return /^\d*$/.test(hex) ? hex : undefined;
}

export function decodeValue(format: DataFormat, value: Uint8Array): { text?: string; valid: boolean } {
  const hex = bytesToHex(value);
  switch (format) {
    case 'ans':
      return { text: bytesToAscii(value), valid: isPrintableAscii(value) };
    case 'an': {
      const t = bytesToAscii(value);
      return { text: t, valid: /^[A-Za-z0-9]*$/.test(t) };
    }
    case 'n': {
      const d = decodeNumeric(hex, 'n');
      return { text: d ?? hex, valid: d !== undefined };
    }
    case 'cn': {
      const d = decodeNumeric(hex, 'cn');
      return { text: d ?? hex, valid: d !== undefined && d.length > 0 };
    }
    case 'track2': {
      const t = hex.replace(/F$/i, '');
      return { text: t, valid: /^\d{1,19}D\d*$/i.test(t) };
    }
    case 'b':
    case 'template':
    default:
      return { text: hex, valid: true };
  }
}

/**
 * Parser for EMVCo Consumer Presented Mode QR payloads.
 *
 * Accepted transports:
 *  - Base64 (standard and URL-safe) — the EMVCo CPM transport encoding
 *  - Hex string starting with '85' (developer convenience)
 *
 * The parser only reports structural / format issues. Business and specification
 * decisions are made by the validators so that rules stay configurable.
 */
export class CpmPayloadParser implements QrParser {
  constructor(private readonly options: CpmParserOptions = {}) {}

  parse(input: string): ParsedQr {
    const raw = (input ?? '').trim();
    const issues: ParseIssue[] = [];
    const base: ParsedQr = {
      raw,
      format: 'EMPTY',
      encoding: 'NONE',
      byteLength: 0,
      nodes: [],
      issues,
      fields: emptyFields(),
      payloadHash: hashString(raw),
      parsedAt: new Date().toISOString(),
      structureValid: false,
    };

    if (!raw) {
      issues.push({ code: 'EMPTY_PAYLOAD', severity: 'ERROR', message: 'QR payload is empty' });
      return base;
    }
    const max = this.options.maxPayloadLength ?? MAX_DEFAULT;
    if (raw.length > max) {
      issues.push({ code: 'PAYLOAD_TOO_LONG', severity: 'ERROR', message: `Payload length ${raw.length} exceeds limit ${max}` });
      return { ...base, format: 'UNKNOWN', encoding: 'TEXT' };
    }

    // EMVCo MPM (merchant presented) payloads are plain-text "ID-LEN-VALUE" starting with 000201.
    if (/^000201/.test(raw)) {
      return this.parseMpm(raw, base);
    }

    let bytes: Uint8Array;
    let encoding: PayloadEncoding;
    try {
      if (/^85[0-9A-F]*$/i.test(raw) && raw.length % 2 === 0) {
        encoding = 'HEX';
        bytes = Uint8Array.from(raw.match(/../g)!.map((h) => parseInt(h, 16)));
      } else if (isBase64Like(raw)) {
        encoding = 'BASE64';
        bytes = base64ToBytes(raw);
      } else {
        issues.push({ code: 'UNSUPPORTED_ENCODING', severity: 'ERROR', message: 'Payload is neither Base64 nor hex encoded; not an EMVCo CPM payload' });
        return { ...base, format: 'UNKNOWN', encoding: 'TEXT' };
      }
    } catch (e) {
      issues.push({ code: 'DECODE_ERROR', severity: 'ERROR', message: `Unable to decode payload: ${(e as Error).message}` });
      return { ...base, format: 'UNKNOWN', encoding: 'TEXT' };
    }

    const result: ParsedQr = { ...base, encoding, byteLength: bytes.length, bytesHex: bytesToHex(bytes) };
    if (bytes.length === 0 || bytes[0] !== 0x85) {
      issues.push({
        code: 'UNSUPPORTED_FORMAT',
        severity: 'ERROR',
        message: 'Decoded payload does not start with Payload Format Indicator tag 85; not an EMVCo CPM payload',
        offset: 0,
      });
      result.format = 'UNKNOWN';
      // Still attempt to parse TLV so developers can inspect the structure.
    } else {
      result.format = 'EMVCO_CPM';
    }

    let rawNodes: RawTlv[] = [];
    try {
      const parsed = parseBerTlv(bytes);
      rawNodes = parsed.nodes;
      if (parsed.paddingBytes > 0) {
        issues.push({ code: 'PADDING', severity: 'INFO', message: `${parsed.paddingBytes} padding byte(s) (0x00) skipped` });
      }
      result.structureValid = true;
    } catch (e) {
      const err = e as TlvError;
      issues.push({ code: err.code ?? 'MALFORMED_TLV', severity: 'ERROR', message: `Malformed TLV: ${err.message}`, offset: err.offset });
      return result;
    }

    result.nodes = rawNodes.map((n) => this.toNode(n, 'ROOT', '', issues));
    this.extractFields(rawNodes, bytes, result);
    return result;
  }

  // ------------------------------------------------------------------
  private toNode(raw: RawTlv, parent: string, parentPath: string, issues: ParseIssue[]): TlvNode {
    const def = getTagDefinition(raw.tag);
    const path = parentPath ? `${parentPath}/${raw.tag}` : raw.tag;
    const node: TlvNode = {
      tag: raw.tag,
      name: def?.name ?? 'Unknown / proprietary tag',
      known: !!def,
      constructed: raw.constructed,
      length: raw.length,
      offset: raw.offset,
      path,
      // Constructed values are represented by their children; sensitive values are never kept in clear.
      valueHex: raw.constructed ? '' : def?.sensitive ? '<masked>' : bytesToHex(raw.value),
    };

    if (!def) {
      issues.push({ code: 'UNKNOWN_TAG', severity: 'INFO', message: `Unknown tag ${raw.tag} at ${path}`, tag: raw.tag, offset: raw.offset });
      if (!raw.constructed && isPrintableAscii(raw.value)) node.display = bytesToAscii(raw.value);
    } else {
      if (!def.allowedIn.includes(parent)) {
        issues.push({
          code: 'TAG_POSITION',
          severity: 'WARNING',
          message: `Tag ${raw.tag} (${def.name}) is not expected inside ${parent === 'ROOT' ? 'the root' : 'template ' + parent}`,
          tag: raw.tag,
          offset: raw.offset,
        });
      }
      if (def.constructed !== raw.constructed) {
        issues.push({ code: 'CONSTRUCTED_MISMATCH', severity: 'ERROR', message: `Tag ${raw.tag} should be ${def.constructed ? 'constructed' : 'primitive'}`, tag: raw.tag, offset: raw.offset });
      }
      if (raw.length < def.minLength || raw.length > def.maxLength) {
        issues.push({
          code: 'INVALID_LENGTH',
          severity: 'ERROR',
          message: `Tag ${raw.tag} (${def.name}) length ${raw.length} outside allowed range ${def.minLength}..${def.maxLength}`,
          tag: raw.tag,
          offset: raw.offset,
        });
      }
      if (!raw.constructed) {
        const { text, valid } = decodeValue(def.format, raw.value);
        if (!valid) {
          issues.push({ code: 'INVALID_FORMAT', severity: 'ERROR', message: `Tag ${raw.tag} (${def.name}) is not valid '${def.format}' data`, tag: raw.tag, offset: raw.offset });
        }
        if (raw.tag === '5A') node.display = maskPan(text ?? '');
        else if (raw.tag === '57') node.display = maskTrack2(text ?? '');
        else node.display = text;
      }
    }
    if (raw.children) node.children = raw.children.map((c) => this.toNode(c, raw.tag, path, issues));
    return node;
  }

  private extractFields(nodes: RawTlv[], bytes: Uint8Array, result: ParsedQr): void {
    const f = result.fields;
    const issues = result.issues;
    const refTag = this.options.transactionReferenceTag?.toUpperCase();
    const expTag = this.options.expiryTag?.toUpperCase();

    const panValues: string[] = [];
    const track2Pans: string[] = [];
    const last4Values: string[] = [];
    const read = (n: RawTlv): string => {
      const def = getTagDefinition(n.tag);
      if (def && !n.constructed) return decodeValue(def.format, n.value).text ?? '';
      return isPrintableAscii(n.value) ? bytesToAscii(n.value) : bytesToHex(n.value);
    };

    const handleCommon = (n: RawTlv, app: CpmFields['applications'][number] | undefined, inTransparent: boolean) => {
      const v = read(n);
      if (refTag && n.tag === refTag) f.transactionReference = v;
      if (expTag && n.tag === expTag) f.expiry = v;
      switch (n.tag) {
        case '4F':
          if (app) app.aid = v;
          f.applicationIdentifier ??= v;
          break;
        case '50':
          if (app) app.label = v;
          f.applicationLabel ??= v;
          break;
        case '5A': {
          const masked = maskPan(v);
          if (app) app.panMasked = masked;
          f.panMasked ??= masked;
          f.panLast4 ??= v.slice(-4);
          f.panLuhnValid ??= luhnValid(v);
          panValues.push(v);
          break;
        }
        case '57': {
          const masked = maskTrack2(v);
          if (app) app.track2Masked = masked;
          f.track2Masked ??= masked;
          f.panLast4 ??= v.split(/D/i)[0].slice(-4);
          track2Pans.push(v.split(/D/i)[0]);
          break;
        }
        case '5F20':
          if (app) app.cardholderName = v.trim();
          f.cardholderName ??= v.trim();
          break;
        case '9F25':
          if (app) app.last4 = v;
          f.panLast4 ??= v;
          last4Values.push(v);
          break;
        case '5F2D': f.languagePreference ??= v; break;
        case '5F50': f.issuerUrl ??= v; break;
        case '9F08': f.applicationVersion ??= v; break;
        case '9F19': f.tokenRequestorId ??= v; break;
        case '9F24': f.paymentAccountReference ??= v; break;
        case '9F26': f.applicationCryptogram ??= v; break;
        case '9F27': f.cryptogramInformationData ??= v; break;
        case '9F36': f.applicationTransactionCounter ??= v; break;
        case '9F10': f.issuerApplicationData ??= v; break;
        case '9F37': f.unpredictableNumber ??= v; break;
        case '9F02': {
          const num = Number(v);
          if (!Number.isNaN(num)) f.amount = num / 100; // n12 with 2 implied decimals
          break;
        }
        case '5F2A': f.currencyCode = v.replace(/^0/, ''); break;
        case '9F1A': f.countryCode = v.replace(/^0/, ''); break;
        case '9F16': f.merchantId = v.trim(); break;
        case '9F1C': f.terminalId = v.trim(); break;
        case '9F15': f.merchantCategoryCode = v; break;
        case '9F4E': f.merchantName = v.trim(); break;
        default:
          if (!n.constructed && (inTransparent || !getTagDefinition(n.tag))) {
            f.additionalData[n.tag] = v;
          }
      }
    };

    const walk = (list: RawTlv[], app: CpmFields['applications'][number] | undefined, inTransparent: boolean) => {
      for (const n of list) {
        if (n.tag === '61') {
          const a = { index: f.applications.length };
          f.applications.push(a);
          walk(n.children ?? [], a, false);
        } else if (n.constructed) {
          walk(n.children ?? [], app, inTransparent || n.tag === '63' || n.tag === '64');
        } else {
          handleCommon(n, app, inTransparent);
        }
      }
    };

    // Root-level primitives.
    for (const n of nodes) {
      if (n.tag === '85') f.payloadFormatIndicator = bytesToAscii(n.value);
    }
    walk(nodes.filter((n) => n.tag !== '85' && n.tag !== SIMULATOR_CRC_TAG), undefined, false);

    // Consistency of account data elements (PAN vs Track 2 vs last-4).
    const notes: string[] = [];
    const pan = panValues[0];
    if (pan && track2Pans[0] && track2Pans[0] !== pan) notes.push('PAN in Track 2 (57) differs from Application PAN (5A)');
    const ref = pan ?? track2Pans[0];
    if (ref && last4Values[0] && ref.slice(-4) !== last4Values[0]) notes.push('Last 4 Digits of PAN (9F25) do not match the account number');
    if (ref && (track2Pans[0] || last4Values[0])) f.accountDataConsistent = notes.length === 0;
    f.accountDataNotes = notes;
    if (!pan && track2Pans[0]) f.panLuhnValid = luhnValid(track2Pans[0]);

    // Optional simulator CRC (non-standard).
    const crcIndex = nodes.findIndex((n) => n.tag === SIMULATOR_CRC_TAG);
    if (crcIndex >= 0) {
      const crcNode = nodes[crcIndex];
      const declared = bytesToHex(crcNode.value);
      const computed = crc16Hex(bytes.slice(0, crcNode.valueOffset));
      f.crc = { present: true, tag: SIMULATOR_CRC_TAG, declared, computed, valid: declared === computed };
      if (crcIndex !== nodes.length - 1) {
        issues.push({ code: 'CRC_NOT_LAST', severity: 'WARNING', message: 'Simulator CRC tag should be the last top-level data object', tag: SIMULATOR_CRC_TAG });
      }
    }

    if (f.currencyCode && CURRENCIES[f.currencyCode]) f.additionalData['currencyAlpha'] = CURRENCIES[f.currencyCode];
    if (f.countryCode && COUNTRIES[f.countryCode]) f.additionalData['countryAlpha'] = COUNTRIES[f.countryCode];
  }

  // ------------------------------------------------------------------
  /** Minimal EMVCo MPM text TLV parse — used to identify (and reject) merchant-presented QRs. */
  private parseMpm(raw: string, base: ParsedQr): ParsedQr {
    const issues = base.issues;
    const result: ParsedQr = { ...base, format: 'EMVCO_MPM' as QrFormat, encoding: 'TEXT', byteLength: raw.length };
    const nodes: TlvNode[] = [];
    let i = 0;
    let ok = true;
    while (i < raw.length) {
      const id = raw.substr(i, 2);
      const lenStr = raw.substr(i + 2, 2);
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) {
        issues.push({ code: 'MALFORMED_TLV', severity: 'ERROR', message: `Malformed MPM data object at position ${i}`, offset: i });
        ok = false;
        break;
      }
      const len = Number(lenStr);
      const value = raw.substr(i + 4, len);
      if (value.length !== len) {
        issues.push({ code: 'LENGTH_OVERFLOW', severity: 'ERROR', message: `MPM ID ${id} declares length ${len} beyond payload end`, offset: i });
        ok = false;
        break;
      }
      nodes.push({ tag: id, name: `MPM ID ${id}`, known: false, constructed: false, length: len, offset: i, path: id, valueHex: value, display: value });
      if (id === '63') {
        const computed = crc16Hex(Uint8Array.from(raw.slice(0, i + 4), (c) => c.charCodeAt(0)));
        result.fields.crc = { present: true, tag: '63', declared: value.toUpperCase(), computed, valid: value.toUpperCase() === computed };
      }
      i += 4 + len;
    }
    result.nodes = nodes;
    result.structureValid = ok;
    issues.push({
      code: 'UNSUPPORTED_FORMAT',
      severity: 'ERROR',
      message: 'Payload is an EMVCo Merchant Presented Mode (QRIS MPM) QR. A merchant CPM terminal accepts only Consumer Presented Mode payloads.',
    });
    return result;
  }
}
