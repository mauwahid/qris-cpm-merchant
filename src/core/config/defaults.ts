import type {
  ApiEnvironment,
  AppSettings,
  EndpointConfig,
  MerchantConfig,
  MockConfig,
  ResponseMapping,
  SimulatorConfig,
  ValidationConfig,
} from './types';

export const CONFIG_VERSION = 1;

/**
 * Simulator default AID. This is a SIMULATION value used by the sample generator so that
 * generated payloads pass local validation. Replace it with the AID(s) published in the
 * official ASPI QRIS CPM specification before running integration tests.
 */
export const SIMULATOR_DEFAULT_AID = 'A0000006022020';

export const defaultMerchant = (): MerchantConfig => ({
  merchantName: 'DEMO MERCHANT',
  merchantId: '123456789012345',
  terminalId: 'TERM001',
  merchantCategoryCode: '5411',
  merchantCity: 'JAKARTA',
  countryCode: 'ID',
  currency: 'IDR',
  currencyNumeric: '360',
  status: 'ACTIVE',
  defaultAmount: 50000,
});

const env = (id: string, name: string, baseUrl: string): ApiEnvironment => ({
  id,
  name,
  baseUrl,
  apiVersion: 'v1',
  authType: 'NONE',
  bearerToken: '',
  basicUsername: '',
  basicPassword: '',
  apiKey: '',
  apiKeyHeaderName: 'X-API-Key',
  customAuthHeaderName: '',
  customAuthHeaderValue: '',
  customHeaders: [{ key: 'X-Client-Id', value: 'merchant-cpm-simulator', enabled: true }],
  timeoutMs: 15000,
  useDevProxy: false,
});

export const defaultEnvironments = (): ApiEnvironment[] => [
  env('env-dev', 'Development', 'http://localhost:8080'),
  env('env-sit', 'SIT', 'https://sit-api.example.com'),
  env('env-uat', 'UAT', 'https://uat-api.example.com'),
  env('env-prod', 'Production', 'https://api.example.com'),
];

export const defaultMapping = (): ResponseMapping => ({
  responseCodePath: '$.responseCode',
  responseMessagePath: '$.responseMessage',
  transactionStatusPath: '$.data.transactionStatus',
  referenceNumberPath: '$.data.referenceNumber',
  successCodes: ['00'],
  statusMapping: {
    SUCCESS: 'APPROVED',
    APPROVED: 'APPROVED',
    PAID: 'APPROVED',
    DECLINED: 'DECLINED',
    FAILED: 'DECLINED',
    REJECTED: 'DECLINED',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'SYSTEM_ERROR',
  },
  errorCodeMapping: {
    '05': 'Do not honor',
    '14': 'Invalid account',
    '51': 'Insufficient funds',
    '68': 'Response received too late',
    '94': 'Duplicate transaction',
    '96': 'System malfunction',
  },
  errorCodePath: '$.errorCode',
  errorMessagePath: '$.errorMessage',
  validationChecksPath: '$.data.checks',
});

const payloadBody = `{
  "transactionId": "{{transactionId}}",
  "merchantId": "{{merchantId}}",
  "terminalId": "{{terminalId}}",
  "amount": {{amount}},
  "currency": "{{currency}}",
  "qrPayload": "{{qrPayload}}",
  "timestamp": "{{timestamp}}"
}`;

export const defaultEndpoints = (): EndpointConfig[] => [
  {
    id: 'ep-validate',
    name: 'Merchant Validation',
    role: 'VALIDATION',
    method: 'POST',
    path: '/api/v1/merchant/validate',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    bodyTemplate: payloadBody,
    mapping: { ...defaultMapping(), transactionStatusPath: '$.data.validationStatus', statusMapping: { VALID: 'APPROVED', INVALID: 'DECLINED' } },
    builtIn: true,
  },
  {
    id: 'ep-payment',
    name: 'Merchant Payment',
    role: 'PAYMENT',
    method: 'POST',
    path: '/api/v1/merchant/payment',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    bodyTemplate: payloadBody,
    mapping: defaultMapping(),
    builtIn: true,
  },
  {
    id: 'ep-inquiry',
    name: 'Transaction Inquiry',
    role: 'INQUIRY',
    method: 'POST',
    path: '/api/v1/merchant/transaction/inquiry',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    bodyTemplate: `{\n  "transactionId": "{{transactionId}}",\n  "merchantId": "{{merchantId}}"\n}`,
    mapping: defaultMapping(),
    builtIn: true,
  },
  {
    id: 'ep-status',
    name: 'Transaction Status',
    role: 'STATUS',
    method: 'GET',
    path: '/api/v1/merchant/transaction/{transactionId}',
    headers: [],
    bodyTemplate: '',
    mapping: defaultMapping(),
    builtIn: true,
  },
  {
    id: 'ep-reversal',
    name: 'Transaction Reversal',
    role: 'REVERSAL',
    method: 'POST',
    path: '/api/v1/merchant/transaction/reversal',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    bodyTemplate: `{\n  "transactionId": "{{transactionId}}",\n  "merchantId": "{{merchantId}}",\n  "amount": {{amount}},\n  "timestamp": "{{timestamp}}"\n}`,
    mapping: defaultMapping(),
    builtIn: true,
  },
  {
    id: 'ep-health',
    name: 'Health Check',
    role: 'HEALTH',
    method: 'GET',
    path: '/actuator/health',
    headers: [],
    bodyTemplate: '',
    mapping: { ...defaultMapping(), responseCodePath: '$.status', successCodes: ['UP'] },
    builtIn: true,
  },
];

export const defaultValidation = (): ValidationConfig => ({
  mandatoryTags: [],
  optionalTags: ['50', '5F20', '63'],
  supportedCurrencies: ['360', 'IDR'],
  allowedMerchantIds: ['123456789012345'],
  allowedTerminalIds: ['TERM001'],
  requireTerminalId: true,
  minAmount: 1,
  maxAmount: 10_000_000,
  supportedAids: [SIMULATOR_DEFAULT_AID],
  duplicateDetection: true,
  payloadExpirySeconds: 0,
  expiryTag: '',
  transactionReferenceTag: '',
  strictMode: false,
  crcProfile: 'OPTIONAL',
  luhnCheck: false,
});

export const defaultMock = (): MockConfig => ({
  response: 'APPROVED',
  processingDelayMs: 1200,
  transactionTimeoutMs: 10000,
  responseCode: '00',
  responseMessage: 'Approved',
  successRate: 100,
});

export const defaultAppSettings = (): AppSettings => ({
  apiIntegrationEnabled: false,
  executionMode: 'MOCK',
  fallbackToLocalValidation: false,
  autoValidateOnScan: true,
  scanCooldownMs: 3000,
  maskSensitiveInLogs: true,
  storeFullPayloadInHistory: true,
  maxHistoryEntries: 1000,
  maxApiLogEntries: 500,
  sensitiveHeaderNames: ['authorization', 'x-api-key', 'cookie', 'set-cookie', 'proxy-authorization'],
});

export const defaultConfig = (): SimulatorConfig => ({
  version: CONFIG_VERSION,
  merchant: defaultMerchant(),
  environments: defaultEnvironments(),
  activeEnvironmentId: 'env-dev',
  endpoints: defaultEndpoints(),
  validation: defaultValidation(),
  mock: defaultMock(),
  app: defaultAppSettings(),
});

/** Currency numeric ↔ alpha lookup for display (subset). */
export const CURRENCIES: Record<string, string> = {
  '360': 'IDR',
  '840': 'USD',
  '702': 'SGD',
  '458': 'MYR',
  '764': 'THB',
  '392': 'JPY',
};
export const COUNTRIES: Record<string, string> = { '360': 'ID', '702': 'SG', '458': 'MY', '764': 'TH', '840': 'US', '392': 'JP' };
