import type { MerchantConfig } from '../config/types';
import type { PaymentProcessor, PaymentRequest, PaymentResult } from '../types';
import type { DynamicApiClient } from '../api/DynamicApiClient';
import { mapApiResponse } from '../api/ResponseMapper';
import { buildTemplateVars } from './templateVars';

/** Real API payment processor — uses the dynamic endpoint registry and response mapping. */
export class BackendPaymentProcessor implements PaymentProcessor {
  readonly mode = 'REAL_API' as const;

  constructor(
    private readonly client: DynamicApiClient,
    private readonly merchant: MerchantConfig,
  ) {}

  async authorize(req: PaymentRequest): Promise<PaymentResult> {
    const endpoint = this.client.findEndpoint('PAYMENT');
    if (!endpoint) return { status: 'SYSTEM_ERROR', responseCode: 'XX', responseMessage: 'No PAYMENT endpoint configured' };
    const tx = req.transaction;
    const vars = buildTemplateVars({
      transactionId: tx.transactionId,
      merchant: this.merchant,
      amount: tx.amount,
      currency: tx.currency,
      parsed: req.parsed,
      qrPayload: req.parsed.raw,
      timestamp: tx.timestamp,
    });
    const res = await this.client.callEndpoint(endpoint.id, vars, { transactionId: tx.transactionId });
    const mapped = mapApiResponse(endpoint.mapping, res);
    return {
      status: mapped.status,
      responseCode: mapped.responseCode,
      responseMessage: mapped.responseMessage,
      referenceNumber: mapped.referenceNumber,
      backendResponse: res.json ?? res.response?.bodyText ?? res.error,
      apiLogIds: res.logId ? [res.logId] : [],
    };
  }
}
