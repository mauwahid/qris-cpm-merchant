import type { ParsedQr, ValidationCheck } from '../types';
import type { CrcProfile } from '../config/types';
import { CPM_PAYLOAD_FORMAT_INDICATOR } from '../cpm/tags';

export interface SpecValidationOptions {
  crcProfile: CrcProfile;
  /** Strict mode turns specification WARNINGs (unknown / misplaced tags) into FAILs. */
  strictMode: boolean;
}

const check = (c: ValidationCheck) => c;

/**
 * Specification Validator — rules mandated by the EMVCo CPM data layout.
 * These rules are NOT configurable: business configuration cannot disable them.
 * (The CRC profile only governs the non-standard simulator CRC, because EMVCo CPM defines no CRC.)
 */
export class SpecificationValidator {
  validate(parsed: ParsedQr, opts: SpecValidationOptions): ValidationCheck[] {
    const checks: ValidationCheck[] = [];
    const issues = parsed.issues;
    const has = (code: string) => issues.filter((i) => i.code === code);
    const warnOrFail = opts.strictMode ? 'FAIL' : 'WARNING';

    // ---- Payload level
    const empty = !parsed.raw;
    checks.push(check({ id: 'PAYLOAD_NOT_EMPTY', name: 'Payload Present', category: 'PAYLOAD', status: empty ? 'FAIL' : 'PASS', description: empty ? 'QR payload is empty' : `Payload received (${parsed.raw.length} chars)` }));
    if (empty) return checks;

    const decodeIssue = issues.find((i) => ['DECODE_ERROR', 'UNSUPPORTED_ENCODING', 'PAYLOAD_TOO_LONG'].includes(i.code));
    checks.push(check({
      id: 'ENCODING',
      name: 'Payload Encoding',
      category: 'PAYLOAD',
      status: decodeIssue ? 'FAIL' : parsed.format === 'EMVCO_MPM' ? 'SKIPPED' : 'PASS',
      description: decodeIssue ? decodeIssue.message : parsed.format === 'EMVCO_MPM' ? 'Plain-text MPM payload (no binary decoding)' : `${parsed.encoding} decoded to ${parsed.byteLength} bytes`,
    }));

    const supported = parsed.format === 'EMVCO_CPM';
    checks.push(check({
      id: 'QR_FORMAT',
      name: 'QR Format',
      category: 'PAYLOAD',
      status: supported ? 'PASS' : 'FAIL',
      description: supported ? 'EMVCo Consumer Presented Mode payload' : (issues.find((i) => i.code === 'UNSUPPORTED_FORMAT')?.message ?? 'Unsupported QR format'),
      expected: 'EMVCo CPM (Base64 BER-TLV starting with tag 85)',
      actual: parsed.format,
    }));

    const tlvErr = issues.find((i) => ['MALFORMED_TLV', 'TRUNCATED_TAG', 'TRUNCATED_LENGTH', 'UNSUPPORTED_LENGTH', 'LENGTH_OVERFLOW', 'MAX_DEPTH'].includes(i.code));
    const constructedErr = has('CONSTRUCTED_MISMATCH');
    checks.push(check({
      id: 'TLV_STRUCTURE',
      name: 'TLV Structure',
      category: 'PAYLOAD',
      status: decodeIssue ? 'SKIPPED' : tlvErr || constructedErr.length ? 'FAIL' : 'PASS',
      description: decodeIssue ? 'Skipped: payload could not be decoded' : tlvErr ? tlvErr.message : constructedErr.length ? constructedErr.map((i) => i.message).join('; ') : 'Payload structure is valid',
      detail: tlvErr?.offset !== undefined ? `Error at byte offset ${tlvErr.offset}` : undefined,
    }));

    // ---- CRC / integrity
    const crc = parsed.fields.crc;
    let crcCheck: ValidationCheck;
    if (opts.crcProfile === 'DISABLED') {
      crcCheck = { id: 'CRC', name: 'CRC Validation', category: 'PAYLOAD', status: 'SKIPPED', description: 'CRC validation disabled in configuration' };
    } else if (crc.present) {
      crcCheck = {
        id: 'CRC',
        name: 'CRC Validation',
        category: 'PAYLOAD',
        status: crc.valid ? 'PASS' : 'FAIL',
        description: crc.valid ? 'CRC is valid' : 'CRC mismatch — payload corrupted or altered',
        expected: crc.computed,
        actual: crc.declared,
        detail: parsed.format === 'EMVCO_MPM' ? 'CRC-16/CCITT-FALSE (MPM tag 63)' : `Simulator CRC-16/CCITT-FALSE in tag ${crc.tag} (non-standard extension)`,
      };
    } else if (opts.crcProfile === 'REQUIRED') {
      crcCheck = { id: 'CRC', name: 'CRC Validation', category: 'PAYLOAD', status: 'FAIL', description: `CRC required by configuration but tag ${crc.tag} is absent` };
    } else {
      crcCheck = {
        id: 'CRC',
        name: 'CRC Validation',
        category: 'PAYLOAD',
        status: 'SKIPPED',
        description: 'No CRC present. EMVCo CPM defines no CRC; integrity is protected by the issuer cryptogram (9F26), which can only be verified by the issuer/backend.',
      };
    }
    checks.push(crcCheck);

    if (!supported || !parsed.structureValid) {
      const reason = !supported ? 'unsupported QR format' : 'TLV structure invalid';
      for (const [id, name] of [
        ['PAYLOAD_FORMAT_INDICATOR', 'Payload Format Indicator'],
        ['APPLICATION_TEMPLATE', 'Application Template'],
        ['APPLICATION_IDENTIFIER_PRESENT', 'Application Identifier (4F)'],
        ['ACCOUNT_DATA', 'Account Data (5A / 57)'],
      ] as const) {
        checks.push({ id, name, category: 'SPECIFICATION', status: 'SKIPPED', description: `Skipped: ${reason}` });
      }
      return checks;
    }

    // ---- Specification level
    const first = parsed.nodes[0];
    const pfi = parsed.fields.payloadFormatIndicator;
    checks.push(check({
      id: 'PAYLOAD_FORMAT_INDICATOR',
      name: 'Payload Format Indicator',
      category: 'SPECIFICATION',
      status: first?.tag === '85' && pfi === CPM_PAYLOAD_FORMAT_INDICATOR ? 'PASS' : 'FAIL',
      description: first?.tag !== '85' ? 'Tag 85 must be the first data object' : pfi === CPM_PAYLOAD_FORMAT_INDICATOR ? 'Tag 85 = CPV01' : `Unsupported payload format indicator "${pfi}"`,
      expected: CPM_PAYLOAD_FORMAT_INDICATOR,
      actual: pfi,
    }));

    const apps = parsed.nodes.filter((n) => n.tag === '61');
    checks.push(check({
      id: 'APPLICATION_TEMPLATE',
      name: 'Application Template',
      category: 'SPECIFICATION',
      status: apps.length > 0 ? 'PASS' : 'FAIL',
      description: apps.length > 0 ? `${apps.length} Application Template(s) (61) present` : 'Mandatory Application Template (61) missing',
    }));

    const missingAid = apps.filter((a) => !a.children?.some((c) => c.tag === '4F'));
    checks.push(check({
      id: 'APPLICATION_IDENTIFIER_PRESENT',
      name: 'Application Identifier (4F)',
      category: 'SPECIFICATION',
      status: apps.length === 0 ? 'SKIPPED' : missingAid.length === 0 ? 'PASS' : 'FAIL',
      description: apps.length === 0 ? 'No application template' : missingAid.length === 0 ? `ADF Name present: ${parsed.fields.applicationIdentifier}` : `ADF Name (4F) missing in ${missingAid.length} Application Template(s)`,
    }));

    const common = parsed.nodes.find((n) => n.tag === '62');
    const commonHasAccount = !!common?.children?.some((c) => c.tag === '5A' || c.tag === '57');
    const appsWithoutAccount = apps.filter((a) => !a.children?.some((c) => c.tag === '5A' || c.tag === '57'));
    const accountOk = apps.length > 0 && (appsWithoutAccount.length === 0 || commonHasAccount);
    checks.push(check({
      id: 'ACCOUNT_DATA',
      name: 'Account Data (5A / 57)',
      category: 'SPECIFICATION',
      status: accountOk ? 'PASS' : 'FAIL',
      description: accountOk ? `Account identified: ${parsed.fields.panMasked ?? parsed.fields.track2Masked}` : 'Application PAN (5A) or Track 2 Equivalent Data (57) must be present',
    }));

    const lengthIssues = has('INVALID_LENGTH');
    checks.push(check({
      id: 'FIELD_LENGTHS',
      name: 'Field Lengths',
      category: 'SPECIFICATION',
      status: lengthIssues.length ? 'FAIL' : 'PASS',
      description: lengthIssues.length ? `${lengthIssues.length} field(s) with invalid length` : 'All known fields within allowed length',
      detail: lengthIssues.map((i) => i.message).join('\n') || undefined,
    }));

    const formatIssues = has('INVALID_FORMAT');
    checks.push(check({
      id: 'DATA_FORMAT',
      name: 'Data Format',
      category: 'SPECIFICATION',
      status: formatIssues.length ? 'FAIL' : 'PASS',
      description: formatIssues.length ? `${formatIssues.length} field(s) with invalid data format` : 'All known fields have a valid data format',
      detail: formatIssues.map((i) => i.message).join('\n') || undefined,
    }));

    const consistent = parsed.fields.accountDataConsistent;
    checks.push(check({
      id: 'ACCOUNT_CONSISTENCY',
      name: 'Account Data Consistency',
      category: 'SPECIFICATION',
      status: consistent === undefined ? 'SKIPPED' : consistent ? 'PASS' : 'FAIL',
      description: consistent === undefined ? 'Only one account data element present' : consistent ? 'PAN, Track 2 and last-4 digits are consistent' : (parsed.fields.accountDataNotes ?? []).join('; '),
    }));

    const positionIssues = has('TAG_POSITION');
    checks.push(check({
      id: 'TAG_PLACEMENT',
      name: 'Tag Placement',
      category: 'SPECIFICATION',
      status: positionIssues.length ? warnOrFail : 'PASS',
      description: positionIssues.length ? `${positionIssues.length} tag(s) outside their expected template` : 'All known tags are in their expected template',
      detail: positionIssues.map((i) => i.message).join('\n') || undefined,
    }));

    const unknown = has('UNKNOWN_TAG');
    checks.push(check({
      id: 'UNKNOWN_TAGS',
      name: 'Unknown Tags',
      category: 'SPECIFICATION',
      status: unknown.length ? warnOrFail : 'PASS',
      description: unknown.length ? `${unknown.length} unknown / proprietary tag(s): ${unknown.map((i) => i.tag).join(', ')}` : 'No unknown tags',
      detail: unknown.length ? 'Unknown tags may be issuer- or ASPI-proprietary. Register them once verified against the official specification.' : undefined,
    }));

    return checks;
  }
}
