import type { ExecutionMode, TransactionStatus } from '../types';

export interface MerchantConfig {
  merchantName: string;
  merchantId: string;
  terminalId: string;
  merchantCategoryCode: string;
  merchantCity: string;
  countryCode: string; // ISO 3166-1 alpha-2
  currency: string; // ISO 4217 alpha
  currencyNumeric: string; // ISO 4217 numeric
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  defaultAmount: number;
}

export type AuthType = 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY' | 'CUSTOM_HEADER';

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiEnvironment {
  id: string;
  name: string;
  baseUrl: string;
  apiVersion: string;
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKey: string;
  apiKeyHeaderName: string;
  customAuthHeaderName: string;
  customAuthHeaderValue: string;
  customHeaders: KeyValue[];
  timeoutMs: number;
  /** Route requests through the Vite dev-server proxy (development only) to avoid CORS. */
  useDevProxy: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ResponseMapping {
  responseCodePath: string;
  responseMessagePath: string;
  transactionStatusPath: string;
  referenceNumberPath: string;
  /** Response codes considered successful. */
  successCodes: string[];
  /** Backend status value → internal status. */
  statusMapping: Record<string, TransactionStatus>;
  /** Error code → friendly message override. */
  errorCodeMapping: Record<string, string>;
  errorCodePath: string;
  errorMessagePath: string;
  /** Optional path to an array of {name,status,description} validation checks. */
  validationChecksPath: string;
}

export interface EndpointConfig {
  id: string;
  name: string;
  /** Role used by the engine to locate the endpoint. Custom endpoints use 'CUSTOM'. */
  role: 'VALIDATION' | 'PAYMENT' | 'INQUIRY' | 'STATUS' | 'REVERSAL' | 'HEALTH' | 'CUSTOM';
  method: HttpMethod;
  path: string;
  headers: KeyValue[];
  bodyTemplate: string;
  timeoutMs?: number;
  mapping: ResponseMapping;
  builtIn: boolean;
}

export type CrcProfile = 'DISABLED' | 'OPTIONAL' | 'REQUIRED';

export interface ValidationConfig {
  /** Additional (business) mandatory tags, on top of the non-removable spec-mandatory tags. */
  mandatoryTags: string[];
  /** Tags expected but not required — reported as WARNING when absent. */
  optionalTags: string[];
  supportedCurrencies: string[]; // ISO numeric or alpha codes
  allowedMerchantIds: string[];
  allowedTerminalIds: string[];
  requireTerminalId: boolean;
  minAmount: number;
  maxAmount: number;
  /** Supported AIDs; an AID matches if it starts with an entry (EMV partial selection). */
  supportedAids: string[];
  duplicateDetection: boolean;
  /** QR payload expiration in seconds measured from first scan. 0 disables. */
  payloadExpirySeconds: number;
  /** Tag carrying an expiry timestamp (YYMMDDhhmmss). Empty = not used. Must be verified with ASPI spec. */
  expiryTag: string;
  /** Tag carrying a transaction reference number. Empty = not used. */
  transactionReferenceTag: string;
  strictMode: boolean;
  crcProfile: CrcProfile;
  luhnCheck: boolean;
}

export interface MockConfig {
  response: 'APPROVED' | 'DECLINED' | 'TIMEOUT' | 'SYSTEM_ERROR' | 'CONNECTION_ERROR';
  processingDelayMs: number;
  transactionTimeoutMs: number;
  responseCode: string;
  responseMessage: string;
  successRate: number; // 0-100, applies to APPROVED
}

export interface AppSettings {
  apiIntegrationEnabled: boolean;
  executionMode: ExecutionMode;
  fallbackToLocalValidation: boolean;
  autoValidateOnScan: boolean;
  scanCooldownMs: number;
  maskSensitiveInLogs: boolean;
  storeFullPayloadInHistory: boolean;
  maxHistoryEntries: number;
  maxApiLogEntries: number;
  sensitiveHeaderNames: string[];
}

export interface SimulatorConfig {
  version: number;
  merchant: MerchantConfig;
  environments: ApiEnvironment[];
  activeEnvironmentId: string;
  endpoints: EndpointConfig[];
  validation: ValidationConfig;
  mock: MockConfig;
  app: AppSettings;
}
