import { bytesToHex } from '../util/hex';

export interface RawTlv {
  tag: string;
  constructed: boolean;
  length: number;
  /** Offset of the first tag byte within the decoded payload. */
  offset: number;
  /** Offset of the first value byte. */
  valueOffset: number;
  value: Uint8Array;
  children?: RawTlv[];
}

export class TlvError extends Error {
  constructor(
    public readonly code: 'TRUNCATED_TAG' | 'TRUNCATED_LENGTH' | 'UNSUPPORTED_LENGTH' | 'LENGTH_OVERFLOW' | 'MAX_DEPTH',
    message: string,
    public readonly offset: number,
  ) {
    super(message);
    this.name = 'TlvError';
  }
}

export interface BerTlvParseOptions {
  /** Maximum template nesting depth (defence against crafted payloads). */
  maxDepth?: number;
  /** Treat 0x00 bytes between data objects as padding (EMV Book 3 §B1). */
  allowPadding?: boolean;
}

/**
 * Parses BER-TLV (ISO/IEC 8825-1 subset used by EMV):
 *  - multi-byte tags when the low 5 bits of the first byte are all 1
 *  - short-form lengths and long-form 0x81 / 0x82 lengths
 *  - constructed objects (bit 6 of first tag byte) are parsed recursively
 */
export function parseBerTlv(
  data: Uint8Array,
  options: BerTlvParseOptions = {},
  baseOffset = 0,
  depth = 0,
): { nodes: RawTlv[]; paddingBytes: number } {
  const maxDepth = options.maxDepth ?? 8;
  const allowPadding = options.allowPadding ?? true;
  if (depth > maxDepth) throw new TlvError('MAX_DEPTH', `Template nesting exceeds ${maxDepth} levels`, baseOffset);

  const nodes: RawTlv[] = [];
  let paddingBytes = 0;
  let i = 0;
  while (i < data.length) {
    if (allowPadding && data[i] === 0x00) {
      paddingBytes++;
      i++;
      continue;
    }
    const start = i;
    // --- tag
    const first = data[i++];
    const constructed = (first & 0x20) !== 0;
    const tagBytes = [first];
    if ((first & 0x1f) === 0x1f) {
      let b: number;
      do {
        if (i >= data.length) throw new TlvError('TRUNCATED_TAG', 'Payload ends inside a multi-byte tag', baseOffset + start);
        b = data[i++];
        tagBytes.push(b);
        if (tagBytes.length > 4) throw new TlvError('TRUNCATED_TAG', 'Tag longer than 4 bytes', baseOffset + start);
      } while (b & 0x80);
    }
    const tag = bytesToHex(Uint8Array.from(tagBytes));
    // --- length
    if (i >= data.length) throw new TlvError('TRUNCATED_LENGTH', `Missing length for tag ${tag}`, baseOffset + start);
    let length = data[i++];
    if (length & 0x80) {
      const n = length & 0x7f;
      if (n === 0 || n > 2) throw new TlvError('UNSUPPORTED_LENGTH', `Unsupported length form 0x${length.toString(16)} for tag ${tag}`, baseOffset + start);
      if (i + n > data.length) throw new TlvError('TRUNCATED_LENGTH', `Truncated long-form length for tag ${tag}`, baseOffset + start);
      length = 0;
      for (let k = 0; k < n; k++) length = (length << 8) | data[i++];
    }
    // --- value
    if (i + length > data.length) {
      throw new TlvError(
        'LENGTH_OVERFLOW',
        `Tag ${tag} declares length ${length} but only ${data.length - i} byte(s) remain`,
        baseOffset + start,
      );
    }
    const value = data.slice(i, i + length);
    const node: RawTlv = { tag, constructed, length, offset: baseOffset + start, valueOffset: baseOffset + i, value };
    if (constructed) {
      node.children = parseBerTlv(value, options, baseOffset + i, depth + 1).nodes;
    }
    nodes.push(node);
    i += length;
  }
  return { nodes, paddingBytes };
}

/** Encodes a BER-TLV length. */
export function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len);
  if (len <= 0xff) return Uint8Array.of(0x81, len);
  if (len <= 0xffff) return Uint8Array.of(0x82, len >> 8, len & 0xff);
  throw new Error('Length too large');
}
