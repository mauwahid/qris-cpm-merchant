import type { ValidationCheck, ValidationResult } from '../types';
import type { QrValidator, ValidationContext } from './types';
import type { DynamicApiClient } from '../api/DynamicApiClient';
import { mapApiResponse } from '../api/ResponseMapper';
import { getByPath } from '../api/jsonPath';
import { ValidationResultMapper } from './ValidationResultMapper';
import { buildTemplateVars } from '../transaction/templateVars';

export class BackendUnavailableError extends Error {
  constructor(message: string, public readonly result?: ValidationResult) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

/**
 * Backend Validation Adapter — delegates validation to the configured VALIDATION endpoint and
 * maps the backend response to the internal ValidationResult.
 * Throws BackendUnavailableError when the backend cannot be reached / mapped (fallback candidate).
 */
export class BackendValidationAdapter implements QrValidator {
  constructor(private readonly client: DynamicApiClient) {}

  async validate(ctx: ValidationContext): Promise<ValidationResult> {
    const started = performance.now();
    const endpoint = this.client.findEndpoint('VALIDATION');
    if (!endpoint) throw new BackendUnavailableError('No VALIDATION endpoint configured');

    const vars = buildTemplateVars({
      transactionId: `VAL-${ctx.parsed.payloadHash}`,
      merchant: ctx.merchant,
      amount: ctx.amount,
      currency: ctx.currency,
      parsed: ctx.parsed,
      timestamp: new Date().toISOString(),
    });
    const res = await this.client.callEndpoint(endpoint.id, vars);
    const mapped = mapApiResponse(endpoint.mapping, res);

    const backendInfo = { httpStatus: res.response?.status, responseCode: mapped.responseCode, responseMessage: mapped.responseMessage, apiLogId: res.logId };

    if (['CONNECTION_ERROR', 'TIMEOUT', 'SYSTEM_ERROR', 'MAPPING_ERROR'].includes(mapped.status)) {
      const failCheck: ValidationCheck = {
        id: 'BACKEND_AVAILABILITY',
        name: 'Backend Validation',
        category: 'BACKEND',
        status: 'FAIL',
        description: `${mapped.status}: ${mapped.responseMessage}`,
        detail: mapped.mappingErrors.join('\n') || undefined,
      };
      const result = ValidationResultMapper.fromChecks([failCheck], 'BACKEND', ctx.parsed.payloadHash, started, { backend: backendInfo, error: mapped.status });
      throw new BackendUnavailableError(`${mapped.status}: ${mapped.responseMessage}`, result);
    }

    const checks: ValidationCheck[] = [];
    const rawChecks = getByPath(res.json, endpoint.mapping.validationChecksPath);
    if (rawChecks.found && Array.isArray(rawChecks.value)) {
      rawChecks.value.forEach((c, i) => checks.push(ValidationResultMapper.fromBackendCheck(c, i)));
    }
    checks.push({
      id: 'BACKEND_DECISION',
      name: 'Backend Validation Decision',
      category: 'BACKEND',
      status: mapped.success ? 'PASS' : 'FAIL',
      description: `[${mapped.responseCode}] ${mapped.responseMessage}`,
      detail: mapped.backendStatus ? `Backend status: ${mapped.backendStatus}` : undefined,
    });
    return ValidationResultMapper.fromChecks(checks, 'BACKEND', ctx.parsed.payloadHash, started, { backend: backendInfo });
  }
}
