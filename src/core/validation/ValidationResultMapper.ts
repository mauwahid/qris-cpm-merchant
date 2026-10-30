import type { CheckStatus, ValidationCheck, ValidationMode, ValidationResult, ValidationSummary } from '../types';
import { uuid } from '../util/id';

export function summarize(checks: ValidationCheck[]): ValidationSummary {
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  return { total: checks.length, passed: count('PASS'), failed: count('FAIL'), warnings: count('WARNING'), skipped: count('SKIPPED') };
}

/**
 * Maps validation checks (local) or backend responses into the single internal
 * ValidationResult format consumed by the UI and the Transaction Engine.
 */
export const ValidationResultMapper = {
  fromChecks(
    checks: ValidationCheck[],
    mode: ValidationMode,
    payloadHash: string,
    startedAt: number,
    extra: Partial<ValidationResult> = {},
  ): ValidationResult {
    const summary = summarize(checks);
    return {
      id: uuid(),
      overallStatus: summary.failed === 0 && checks.length > 0 ? 'VALID' : 'INVALID',
      mode,
      checks,
      summary,
      payloadHash,
      validatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...extra,
    };
  },

  /** Normalises a backend-provided check entry ({name,status,description}) to an internal check. */
  fromBackendCheck(raw: unknown, index: number): ValidationCheck {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const s = String(o.status ?? o.result ?? '').toUpperCase();
    const status: CheckStatus = s === 'PASS' || s === 'OK' || s === 'SUCCESS' ? 'PASS' : s === 'WARN' || s === 'WARNING' ? 'WARNING' : s === 'SKIP' || s === 'SKIPPED' ? 'SKIPPED' : 'FAIL';
    return {
      id: `BACKEND_${index}`,
      name: String(o.name ?? o.check ?? `Backend check ${index + 1}`),
      category: 'BACKEND',
      status,
      description: String(o.description ?? o.message ?? ''),
    };
  },
};
