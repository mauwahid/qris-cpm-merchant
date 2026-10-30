import type { MerchantConfig, ValidationConfig } from '../config/types';
import type { ParsedQr, TransactionRepository, ValidationResult } from '../types';

export interface ValidationContext {
  parsed: ParsedQr;
  merchant: MerchantConfig;
  config: ValidationConfig;
  /** Amount entered at the merchant terminal (CPM: the merchant keys in the amount). */
  amount: number;
  /** Currency (ISO numeric or alpha). Defaults to the merchant currency. */
  currency?: string;
  history: Pick<TransactionRepository, 'findByPayloadHash' | 'findByReference'>;
  /** When this payload was first scanned (for expiry by validity window). */
  firstSeenAt?: string;
  now?: Date;
}

/** Common interface for the local and backend validators. */
export interface QrValidator {
  validate(ctx: ValidationContext): Promise<ValidationResult>;
}
