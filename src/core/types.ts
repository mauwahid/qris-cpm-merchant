/* ------------------------------------------------------------------ *
 * Shared domain types. Every module depends on these abstractions,
 * never on each other's concrete implementations.
 * ------------------------------------------------------------------ */

// ---------- QR parsing ----------
export type QrFormat = 'EMVCO_CPM' | 'EMVCO_MPM' | 'UNKNOWN' | 'EMPTY';
export type PayloadEncoding = 'BASE64' | 'HEX' | 'TEXT' | 'NONE';
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ParseIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  tag?: string;
  offset?: number;
}

export interface TlvNode {
  tag: string;
  name: string;
  known: boolean;
  constructed: boolean;
  length: number;
  offset: number;
  path: string; // e.g. "61/63/9F26"
  valueHex: string;
  /** Human readable decoded value (masked if sensitive). */
  display?: string;
  children?: TlvNode[];
}

export interface CpmApplication {
  index: number;
  aid?: string;
  label?: string;
  panMasked?: string;
  track2Masked?: string;
  cardholderName?: string;
  last4?: string;
}

export interface CrcInfo {
  present: boolean;
  tag: string;
  declared?: string;
  computed?: string;
  valid?: boolean;
}

export interface CpmFields {
  payloadFormatIndicator?: string;
  applications: CpmApplication[];
  applicationIdentifier?: string;
  applicationLabel?: string;
  panMasked?: string;
  panLast4?: string;
  panLuhnValid?: boolean;
  /** Primary account number from 5A/57 is consistent with 9F25 and Track 2 (undefined if not comparable). */
  accountDataConsistent?: boolean;
  accountDataNotes?: string[];
  track2Masked?: string;
  cardholderName?: string;
  languagePreference?: string;
  issuerUrl?: string;
  applicationVersion?: string;
  tokenRequestorId?: string;
  paymentAccountReference?: string;
  applicationCryptogram?: string;
  cryptogramInformationData?: string;
  applicationTransactionCounter?: string;
  issuerApplicationData?: string;
  unpredictableNumber?: string;
  // Terminal / transaction data objects — only present if the payload carries them.
  amount?: number;
  currencyCode?: string;
  countryCode?: string;
  merchantId?: string;
  terminalId?: string;
  merchantName?: string;
  merchantCategoryCode?: string;
  transactionReference?: string;
  expiry?: string;
  additionalData: Record<string, string>;
  crc: CrcInfo;
}

export interface ParsedQr {
  raw: string;
  format: QrFormat;
  encoding: PayloadEncoding;
  byteLength: number;
  bytesHex?: string;
  nodes: TlvNode[];
  issues: ParseIssue[];
  fields: CpmFields;
  payloadHash: string;
  parsedAt: string;
  /** True if the TLV tree could be fully decoded (structure is well-formed). */
  structureValid: boolean;
}

export interface QrParser {
  parse(raw: string): ParsedQr;
}

// ---------- Validation ----------
export type ValidationMode = 'LOCAL' | 'BACKEND';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';
export type CheckCategory = 'PAYLOAD' | 'SPECIFICATION' | 'BUSINESS' | 'BACKEND';

export interface ValidationCheck {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  description: string;
  detail?: string;
  expected?: string;
  actual?: string;
}

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

export interface ValidationResult {
  id: string;
  overallStatus: 'VALID' | 'INVALID';
  mode: ValidationMode;
  checks: ValidationCheck[];
  summary: ValidationSummary;
  payloadHash: string;
  validatedAt: string;
  durationMs: number;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  backend?: {
    httpStatus?: number;
    responseCode?: string;
    responseMessage?: string;
    apiLogId?: string;
  };
  error?: string;
}

// ---------- Transactions ----------
export type ExecutionMode = 'MOCK' | 'REAL_API';
export type TransactionStatus =
  | 'PROCESSING'
  | 'APPROVED'
  | 'DECLINED'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'SYSTEM_ERROR'
  | 'CONNECTION_ERROR'
  | 'MAPPING_ERROR';

export const FINAL_FAILURE_STATUSES: TransactionStatus[] = [
  'DECLINED',
  'TIMEOUT',
  'SYSTEM_ERROR',
  'CONNECTION_ERROR',
  'MAPPING_ERROR',
];

export interface Transaction {
  transactionId: string;
  timestamp: string;
  completedAt?: string;
  merchantId: string;
  merchantName: string;
  terminalId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  responseCode?: string;
  responseMessage?: string;
  referenceNumber?: string;
  validationMode: ValidationMode;
  executionMode: ExecutionMode;
  environment: string;
  qrPayload: string;
  payloadHash: string;
  applicationIdentifier?: string;
  panMasked?: string;
  transactionReference?: string;
  validationResultId?: string;
  validationStatus?: 'VALID' | 'INVALID';
  backendResponse?: unknown;
  apiLogIds?: string[];
  durationMs?: number;
  rejectReason?: string;
  scenario?: string;
}

export interface PaymentRequest {
  transaction: Transaction;
  parsed: ParsedQr;
}

export interface PaymentResult {
  status: Exclude<TransactionStatus, 'PROCESSING' | 'REJECTED'>;
  responseCode: string;
  responseMessage: string;
  referenceNumber?: string;
  backendResponse?: unknown;
  apiLogIds?: string[];
}

/** Payment authorization abstraction — separate from QR validation. */
export interface PaymentProcessor {
  readonly mode: ExecutionMode;
  authorize(request: PaymentRequest, signal?: AbortSignal): Promise<PaymentResult>;
}

export interface TransactionRepository {
  list(): Transaction[];
  get(id: string): Transaction | undefined;
  save(tx: Transaction): void;
  clear(): void;
  findByPayloadHash(hash: string): Transaction[];
  findByReference(ref: string): Transaction[];
}

// ---------- Logs ----------
export type LogCategory = 'PARSING' | 'VALIDATION' | 'TRANSACTION' | 'SCANNER' | 'SYSTEM';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface AppLogEntry {
  id: string;
  timestamp: string;
  category: LogCategory;
  level: LogLevel;
  message: string;
  data?: unknown;
  correlationId?: string;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  environment: string;
  endpointId?: string;
  endpointName?: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  transactionId?: string;
  simulated?: boolean;
}
