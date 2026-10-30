/**
 * Data object dictionary for EMVCo QR Code Specification for Payment Systems —
 * Consumer Presented Mode (CPM). Tags are BER-TLV encoded (binary), Base64 transported.
 *
 * Source: EMVCo "QR Code Specification for Payment Systems (EMV QRCPS) Consumer-Presented Mode",
 * plus standard EMV Book 3 data elements that CPM permits inside the Application Specific
 * Transparent Template ('63') / Common Data Transparent Template ('64').
 *
 * IMPORTANT: ASPI QRIS CPM may define additional constraints or proprietary tags. Those are
 * NOT hard-coded here. Add them through `registerTag()` or the Validation Configuration page
 * once verified against the official ASPI QRIS CPM specification.
 */
export type DataFormat =
  | 'ans' // alphanumeric special (printable ASCII)
  | 'an' // alphanumeric
  | 'b' // binary
  | 'n' // BCD numeric (2 digits / byte)
  | 'cn' // compressed numeric, right padded with 'F'
  | 'track2' // Track 2 equivalent (BCD, 'D' separator, 'F' padding)
  | 'template'; // constructed

export type TagSource = 'EMVCO_CPM' | 'EMV' | 'SIMULATOR' | 'CUSTOM';

export interface TagDefinition {
  tag: string;
  name: string;
  format: DataFormat;
  minLength: number; // in bytes
  maxLength: number; // in bytes
  constructed: boolean;
  source: TagSource;
  /** Templates in which the tag may appear ('ROOT' = top level). */
  allowedIn: string[];
  description?: string;
  sensitive?: boolean;
}

const T = (d: TagDefinition) => d;
const APP = ['61', '62'];
const TRANSPARENT = ['63', '64'];

/** Simulator-only private-class tag carrying an optional CRC-16. NOT part of EMVCo or ASPI. */
export const SIMULATOR_CRC_TAG = 'DF7F';

const BUILTIN: TagDefinition[] = [
  T({ tag: '85', name: 'Payload Format Indicator', format: 'ans', minLength: 5, maxLength: 5, constructed: false, source: 'EMVCO_CPM', allowedIn: ['ROOT'], description: 'Shall be "CPV01" for EMVCo CPM' }),
  T({ tag: '61', name: 'Application Template', format: 'template', minLength: 1, maxLength: 0xffff, constructed: true, source: 'EMVCO_CPM', allowedIn: ['ROOT'] }),
  T({ tag: '62', name: 'Common Data Template', format: 'template', minLength: 1, maxLength: 0xffff, constructed: true, source: 'EMVCO_CPM', allowedIn: ['ROOT'] }),
  T({ tag: '63', name: 'Application Specific Transparent Template', format: 'template', minLength: 1, maxLength: 0xffff, constructed: true, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '64', name: 'Common Data Transparent Template', format: 'template', minLength: 1, maxLength: 0xffff, constructed: true, source: 'EMVCO_CPM', allowedIn: ['62'] }),
  T({ tag: '4F', name: 'Application Definition File (ADF) Name', format: 'b', minLength: 5, maxLength: 16, constructed: false, source: 'EMVCO_CPM', allowedIn: ['61'], description: 'Application Identifier (AID)' }),
  T({ tag: '50', name: 'Application Label', format: 'ans', minLength: 1, maxLength: 16, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '57', name: 'Track 2 Equivalent Data', format: 'track2', minLength: 1, maxLength: 19, constructed: false, source: 'EMVCO_CPM', allowedIn: APP, sensitive: true }),
  T({ tag: '5A', name: 'Application PAN', format: 'cn', minLength: 1, maxLength: 10, constructed: false, source: 'EMVCO_CPM', allowedIn: APP, sensitive: true }),
  T({ tag: '5F20', name: 'Cardholder Name', format: 'ans', minLength: 2, maxLength: 26, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '5F2D', name: 'Language Preference', format: 'an', minLength: 2, maxLength: 8, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '5F50', name: 'Issuer URL', format: 'ans', minLength: 1, maxLength: 255, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '9F08', name: 'Application Version Number', format: 'b', minLength: 2, maxLength: 2, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '9F19', name: 'Token Requestor ID', format: 'n', minLength: 6, maxLength: 6, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '9F24', name: 'Payment Account Reference', format: 'an', minLength: 29, maxLength: 29, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  T({ tag: '9F25', name: 'Last 4 Digits of PAN', format: 'n', minLength: 2, maxLength: 2, constructed: false, source: 'EMVCO_CPM', allowedIn: APP }),
  // EMV Book 3 data objects commonly carried in transparent templates.
  T({ tag: '9F26', name: 'Application Cryptogram', format: 'b', minLength: 8, maxLength: 8, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F27', name: 'Cryptogram Information Data', format: 'b', minLength: 1, maxLength: 1, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F10', name: 'Issuer Application Data', format: 'b', minLength: 1, maxLength: 32, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F36', name: 'Application Transaction Counter', format: 'b', minLength: 2, maxLength: 2, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '82', name: 'Application Interchange Profile', format: 'b', minLength: 2, maxLength: 2, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F37', name: 'Unpredictable Number', format: 'b', minLength: 4, maxLength: 4, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '5F34', name: 'PAN Sequence Number', format: 'n', minLength: 1, maxLength: 1, constructed: false, source: 'EMV', allowedIn: [...APP, ...TRANSPARENT] }),
  T({ tag: '9F02', name: 'Amount, Authorised', format: 'n', minLength: 6, maxLength: 6, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '5F2A', name: 'Transaction Currency Code', format: 'n', minLength: 2, maxLength: 2, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F1A', name: 'Terminal Country Code', format: 'n', minLength: 2, maxLength: 2, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F16', name: 'Merchant Identifier', format: 'ans', minLength: 15, maxLength: 15, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F1C', name: 'Terminal Identification', format: 'an', minLength: 8, maxLength: 8, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F15', name: 'Merchant Category Code', format: 'n', minLength: 2, maxLength: 2, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  T({ tag: '9F4E', name: 'Merchant Name and Location', format: 'ans', minLength: 1, maxLength: 64, constructed: false, source: 'EMV', allowedIn: TRANSPARENT }),
  // Simulator-only extension.
  T({ tag: SIMULATOR_CRC_TAG, name: 'Simulator CRC-16 (non-standard)', format: 'b', minLength: 2, maxLength: 2, constructed: false, source: 'SIMULATOR', allowedIn: ['ROOT'], description: 'Optional simulator integrity check. Not defined by EMVCo or ASPI.' }),
];

const registry = new Map<string, TagDefinition>(BUILTIN.map((d) => [d.tag, d]));

export function getTagDefinition(tag: string): TagDefinition | undefined {
  return registry.get(tag.toUpperCase());
}

/** Register or override a tag definition (e.g. once ASPI-specific tags are verified). */
export function registerTag(def: TagDefinition): void {
  registry.set(def.tag.toUpperCase(), def);
}

export function listTagDefinitions(): TagDefinition[] {
  return Array.from(registry.values());
}

/** Tags that EMVCo CPM requires. These cannot be disabled via configuration. */
export const SPEC_MANDATORY_TAGS = ['85', '61', '4F'] as const;
export const CPM_PAYLOAD_FORMAT_INDICATOR = 'CPV01';
