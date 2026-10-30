/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, xorout 0x0000).
 * This is the CRC algorithm used by EMVCo MPM (tag 63). EMVCo CPM itself does not define
 * a CRC; the simulator uses it only for the optional, non-standard "simulator CRC" profile.
 */
export function crc16CcittFalse(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function crc16Hex(data: Uint8Array): string {
  return crc16CcittFalse(data).toString(16).toUpperCase().padStart(4, '0');
}
