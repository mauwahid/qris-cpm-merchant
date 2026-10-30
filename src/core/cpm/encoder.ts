import { asciiToBytes, concatBytes, hexToBytes } from '../util/hex';
import { encodeLength } from './berTlv';
import { crc16CcittFalse } from './crc16';
import { SIMULATOR_CRC_TAG } from './tags';

export type TlvValue = Uint8Array | TlvSpec[];
export interface TlvSpec {
  tag: string;
  value: TlvValue;
}

export function encodeTlv(spec: TlvSpec): Uint8Array {
  const tag = hexToBytes(spec.tag);
  const value = Array.isArray(spec.value) ? concatBytes(...spec.value.map(encodeTlv)) : spec.value;
  return concatBytes(tag, encodeLength(value.length), value);
}

export function encodeAll(specs: TlvSpec[]): Uint8Array {
  return concatBytes(...specs.map(encodeTlv));
}

export const ascii = (s: string) => asciiToBytes(s);
export const hex = (s: string) => hexToBytes(s);
/** Compressed numeric: digits right padded with F to a whole number of bytes. */
export const cn = (digits: string) => hexToBytes(digits.length % 2 ? digits + 'F' : digits);
/** BCD numeric, left padded with 0 to `bytes` bytes. */
export const n = (digits: string, bytes: number) => hexToBytes(digits.padStart(bytes * 2, '0'));

/** Appends the non-standard simulator CRC data object (tag DF7F) to an encoded payload. */
export function appendSimulatorCrc(payload: Uint8Array): Uint8Array {
  const header = concatBytes(hexToBytes(SIMULATOR_CRC_TAG), Uint8Array.of(0x02));
  const crc = crc16CcittFalse(concatBytes(payload, header));
  return concatBytes(payload, header, Uint8Array.of(crc >> 8, crc & 0xff));
}
