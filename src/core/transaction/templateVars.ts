import type { MerchantConfig } from '../config/types';
import type { ParsedQr } from '../types';
import type { TemplateVars } from '../api/template';
import { CURRENCIES } from '../config/defaults';

export function buildTemplateVars(input: {
  transactionId: string;
  merchant: MerchantConfig;
  amount: number;
  currency?: string;
  parsed?: ParsedQr;
  qrPayload?: string;
  timestamp: string;
}): TemplateVars {
  const currency = input.currency ?? input.merchant.currency;
  const alpha = CURRENCIES[currency] ?? currency;
  const numeric = Object.entries(CURRENCIES).find(([, a]) => a === alpha)?.[0] ?? input.merchant.currencyNumeric;
  return {
    transactionId: input.transactionId,
    merchantId: input.parsed?.fields.merchantId ?? input.merchant.merchantId,
    merchantName: input.merchant.merchantName,
    terminalId: input.parsed?.fields.terminalId ?? input.merchant.terminalId,
    amount: input.amount,
    amountMinor: Math.round(input.amount * 100),
    currency: alpha,
    currencyNumeric: numeric,
    qrPayload: input.qrPayload ?? input.parsed?.raw ?? '',
    timestamp: input.timestamp,
    applicationIdentifier: input.parsed?.fields.applicationIdentifier ?? '',
  };
}
