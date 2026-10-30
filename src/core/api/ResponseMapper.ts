import type { ResponseMapping } from '../config/types';
import type { TransactionStatus } from '../types';
import type { ApiCallResult } from './types';
import { getByPath } from './jsonPath';

export interface MappedResponse {
  status: Exclude<TransactionStatus, 'PROCESSING' | 'REJECTED'>;
  success: boolean;
  responseCode: string;
  responseMessage: string;
  referenceNumber?: string;
  backendStatus?: string;
  mappingErrors: string[];
  raw?: unknown;
}

const INTERNAL: TransactionStatus[] = ['APPROVED', 'DECLINED', 'TIMEOUT', 'SYSTEM_ERROR', 'CONNECTION_ERROR', 'MAPPING_ERROR'];

const str = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Request/Response Mapping Engine — converts any backend response into the internal result
 * using the configurable JSONPath mapping. The Transaction Engine never sees backend formats.
 */
export function mapApiResponse(mapping: ResponseMapping, result: ApiCallResult): MappedResponse {
  if (result.error) {
    const t = result.error.type;
    const status = t === 'TIMEOUT' ? 'TIMEOUT' : t === 'NETWORK' || t === 'DISABLED' || t === 'INVALID_URL' ? 'CONNECTION_ERROR' : 'SYSTEM_ERROR';
    return {
      status,
      success: false,
      responseCode: t === 'TIMEOUT' ? '68' : t === 'NETWORK' ? 'CE' : 'XX',
      responseMessage: result.error.message,
      mappingErrors: [],
    };
  }
  const http = result.response!;
  const errors: string[] = [];

  if (result.jsonError || result.json === undefined) {
    if (http.status >= 500) {
      return { status: 'SYSTEM_ERROR', success: false, responseCode: String(http.status), responseMessage: `HTTP ${http.status} ${http.statusText}`.trim(), mappingErrors: [] };
    }
    return {
      status: 'MAPPING_ERROR',
      success: false,
      responseCode: 'ME',
      responseMessage: result.jsonError ?? 'Empty response body; nothing to map',
      mappingErrors: [result.jsonError ?? 'Empty response body'],
    };
  }

  const json = result.json;
  const code = getByPath(json, mapping.responseCodePath);
  const message = getByPath(json, mapping.responseMessagePath);
  const status = getByPath(json, mapping.transactionStatusPath);
  const ref = getByPath(json, mapping.referenceNumberPath);
  const errCode = getByPath(json, mapping.errorCodePath);
  const errMsg = getByPath(json, mapping.errorMessagePath);

  const responseCode = str(code.value) ?? str(errCode.value);
  if (!code.found && !status.found && !errCode.found) {
    errors.push(`None of the mapped fields were found (${mapping.responseCodePath}, ${mapping.transactionStatusPath}, ${mapping.errorCodePath})`);
  }

  let mapped: MappedResponse['status'] | undefined;
  const backendStatus = str(status.value);
  if (backendStatus !== undefined) {
    const viaMap = mapping.statusMapping[backendStatus] ?? mapping.statusMapping[backendStatus.toUpperCase()];
    if (viaMap && viaMap !== 'PROCESSING' && viaMap !== 'REJECTED') mapped = viaMap;
    else if (INTERNAL.includes(backendStatus.toUpperCase() as TransactionStatus)) mapped = backendStatus.toUpperCase() as MappedResponse['status'];
    else errors.push(`Backend status "${backendStatus}" has no entry in the status mapping`);
  }

  const codeIsSuccess = responseCode !== undefined && mapping.successCodes.includes(responseCode);
  if (!mapped) {
    if (errors.length && responseCode === undefined) mapped = 'MAPPING_ERROR';
    else if (http.status >= 500) mapped = 'SYSTEM_ERROR';
    else if (responseCode !== undefined) mapped = codeIsSuccess && http.status < 400 ? 'APPROVED' : 'DECLINED';
    else mapped = 'MAPPING_ERROR';
  }
  // A success status must be confirmed by a success code when a code is present.
  if (mapped === 'APPROVED' && responseCode !== undefined && !codeIsSuccess) mapped = 'DECLINED';
  if (mapped === 'APPROVED' && http.status >= 400) mapped = http.status >= 500 ? 'SYSTEM_ERROR' : 'DECLINED';

  const responseMessage =
    str(message.value) ??
    str(errMsg.value) ??
    (responseCode ? mapping.errorCodeMapping[responseCode] : undefined) ??
    (mapped === 'MAPPING_ERROR' ? errors.join('; ') : `HTTP ${http.status}`);

  return {
    status: mapped,
    success: mapped === 'APPROVED',
    responseCode: responseCode ?? (mapped === 'MAPPING_ERROR' ? 'ME' : String(http.status)),
    responseMessage: !codeIsSuccess && responseCode && mapping.errorCodeMapping[responseCode] && !message.found ? mapping.errorCodeMapping[responseCode] : responseMessage,
    referenceNumber: str(ref.value),
    backendStatus,
    mappingErrors: errors,
    raw: json,
  };
}
