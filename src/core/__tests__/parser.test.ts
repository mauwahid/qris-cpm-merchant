import { describe, expect, it } from 'vitest';
import { CpmPayloadParser } from '../cpm/CpmPayloadParser';
import { parseBerTlv, TlvError } from '../cpm/berTlv';
import { crc16Hex } from '../cpm/crc16';
import { asciiToBytes, bytesToHex, hexToBytes } from '../util/hex';
import { bytesToBase64 } from '../cpm/base64';
import { ascii, cn, encodeAll, hex } from '../cpm/encoder';
import { corruptCrc, generateSamplePayload, malformedPayload, SAMPLE_MPM } from '../cpm/sampleGenerator';

const parser = new CpmPayloadParser();
const PAN = '9360001234567890127';

describe('BER-TLV parsing', () => {
  it('parses primitive and multi-byte tags', () => {
    const { nodes } = parseBerTlv(hexToBytes('850543505630315F200441424344'));
    expect(nodes.map((n) => n.tag)).toEqual(['85', '5F20']);
    expect(nodes[0].length).toBe(5);
    expect(bytesToHex(nodes[1].value)).toBe('41424344');
  });

  it('parses nested (constructed) templates', () => {
    const bytes = encodeAll([{ tag: '61', value: [{ tag: '4F', value: hex('A000000001') }, { tag: '63', value: [{ tag: '9F36', value: hex('0001') }] }] }]);
    const { nodes } = parseBerTlv(bytes);
    expect(nodes[0].constructed).toBe(true);
    expect(nodes[0].children?.[0].tag).toBe('4F');
    expect(nodes[0].children?.[1].children?.[0].tag).toBe('9F36');
    expect(bytesToHex(nodes[0].children![1].children![0].value)).toBe('0001');
  });

  it('supports long-form lengths (0x81)', () => {
    const value = 'A'.repeat(200);
    const bytes = encodeAll([{ tag: '5F50', value: ascii(value) }]);
    expect(bytes[2]).toBe(0x81);
    const { nodes } = parseBerTlv(bytes);
    expect(nodes[0].length).toBe(200);
  });

  it('throws on declared length beyond data (invalid length)', () => {
    expect(() => parseBerTlv(hexToBytes('85094350563031'))).toThrow(TlvError);
    try {
      parseBerTlv(hexToBytes('85094350563031'));
    } catch (e) {
      expect((e as TlvError).code).toBe('LENGTH_OVERFLOW');
    }
  });

  it('throws on truncated multi-byte tag', () => {
    expect(() => parseBerTlv(hexToBytes('9F'))).toThrow(/multi-byte tag/);
  });
});

describe('CRC-16/CCITT-FALSE', () => {
  it('matches the standard check value', () => {
    expect(crc16Hex(asciiToBytes('123456789'))).toBe('29B1');
  });

  it('validates the MPM sample CRC', () => {
    const r = parser.parse(SAMPLE_MPM);
    expect(r.format).toBe('EMVCO_MPM');
    expect(r.fields.crc.valid).toBe(true);
  });

  it('validates and rejects simulator CRC on CPM payloads', () => {
    const good = generateSamplePayload({ pan: PAN });
    const r1 = parser.parse(good);
    expect(r1.fields.crc.present).toBe(true);
    expect(r1.fields.crc.valid).toBe(true);
    const r2 = parser.parse(corruptCrc(good));
    expect(r2.fields.crc.valid).toBe(false);
  });
});

describe('CpmPayloadParser', () => {
  it('parses a generated EMVCo CPM payload', () => {
    const r = parser.parse(generateSamplePayload({ pan: PAN, cardholderName: 'JOHN DOE' }));
    expect(r.format).toBe('EMVCO_CPM');
    expect(r.encoding).toBe('BASE64');
    expect(r.structureValid).toBe(true);
    expect(r.fields.payloadFormatIndicator).toBe('CPV01');
    expect(r.fields.applicationIdentifier).toBe('A0000006022020');
    expect(r.fields.panMasked).toBe('936000*********0127');
    expect(r.fields.panLuhnValid).toBe(true);
    expect(r.fields.cardholderName).toBe('JOHN DOE');
    expect(r.fields.applicationCryptogram).toMatch(/^[0-9A-F]{16}$/);
    expect(r.issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('accepts hex encoded input', () => {
    const bytes = encodeAll([{ tag: '85', value: ascii('CPV01') }, { tag: '61', value: [{ tag: '4F', value: hex('A0000006022020') }, { tag: '5A', value: cn(PAN) }] }]);
    const r = parser.parse(bytesToHex(bytes));
    expect(r.encoding).toBe('HEX');
    expect(r.fields.panLast4).toBe('0127');
  });

  it('never exposes the full PAN in nodes', () => {
    const r = parser.parse(generateSamplePayload({ pan: PAN, includeTrack2: true }));
    expect(JSON.stringify(r.nodes.map((n) => ({ ...n, valueHex: '' })))).not.toContain(PAN);
  });

  it('reports empty payload', () => {
    const r = parser.parse('   ');
    expect(r.format).toBe('EMPTY');
    expect(r.issues[0].code).toBe('EMPTY_PAYLOAD');
  });

  it('reports malformed TLV', () => {
    const r = parser.parse(malformedPayload());
    expect(r.structureValid).toBe(false);
    expect(r.issues.some((i) => i.code === 'LENGTH_OVERFLOW')).toBe(true);
  });

  it('reports invalid field length', () => {
    const bytes = encodeAll([{ tag: '85', value: ascii('CPV01') }, { tag: '61', value: [{ tag: '4F', value: hex('A000') }, { tag: '5A', value: cn(PAN) }] }]);
    const r = parser.parse(bytesToBase64(bytes));
    expect(r.issues.some((i) => i.code === 'INVALID_LENGTH' && i.tag === '4F')).toBe(true);
  });

  it('reports invalid data format', () => {
    const bytes = encodeAll([{ tag: '85', value: ascii('CPV01') }, { tag: '61', value: [{ tag: '4F', value: hex('A0000006022020') }, { tag: '5A', value: hex('93AB') }] }]);
    const r = parser.parse(bytesToBase64(bytes));
    expect(r.issues.some((i) => i.code === 'INVALID_FORMAT' && i.tag === '5A')).toBe(true);
  });

  it('flags unknown tags without failing', () => {
    const r = parser.parse(generateSamplePayload({ extraTransparentTags: { DF55: 'XYZ' } }));
    expect(r.issues.some((i) => i.code === 'UNKNOWN_TAG' && i.tag === 'DF55')).toBe(true);
    expect(r.fields.additionalData.DF55).toBe('XYZ');
  });

  it('identifies non-CPM data as unsupported', () => {
    expect(parser.parse('hello world!').format).toBe('UNKNOWN');
    expect(parser.parse(bytesToBase64(asciiToBytes('random data'))).issues.some((i) => i.code === 'UNSUPPORTED_FORMAT')).toBe(true);
  });

  it('extracts EMV amount and currency when embedded', () => {
    const r = parser.parse(generateSamplePayload({ amount: 75000, currencyNumeric: '360' }));
    expect(r.fields.amount).toBe(75000);
    expect(r.fields.currencyCode).toBe('360');
  });

  it('extracts configurable transaction reference tag', () => {
    const p = new CpmPayloadParser({ transactionReferenceTag: 'DF10' });
    const r = p.parse(generateSamplePayload({ extraTransparentTags: { DF10: 'REF123456' } }));
    expect(r.fields.transactionReference).toBe('REF123456');
  });
});
