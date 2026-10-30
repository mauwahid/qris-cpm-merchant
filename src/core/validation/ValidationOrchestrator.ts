import type { ValidationResult } from '../types';
import type { QrValidator, ValidationContext } from './types';
import { BackendUnavailableError } from './BackendValidationAdapter';

export interface OrchestratorOptions {
  apiIntegrationEnabled: boolean;
  fallbackToLocal: boolean;
}

export interface OrchestratorLogger {
  (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void;
}

/**
 * Validation Orchestrator — selects the validation mode:
 *   API disabled               → LOCAL (no HTTP)
 *   API enabled                → BACKEND
 *   API enabled, backend down  → error, or LOCAL fallback when allowed
 */
export class ValidationOrchestrator {
  constructor(
    private readonly local: QrValidator,
    private readonly backend: QrValidator | undefined,
    private readonly options: OrchestratorOptions,
    private readonly log: OrchestratorLogger = () => {},
  ) {}

  get mode(): 'LOCAL' | 'BACKEND' {
    return this.options.apiIntegrationEnabled && this.backend ? 'BACKEND' : 'LOCAL';
  }

  async validate(ctx: ValidationContext): Promise<ValidationResult> {
    if (this.mode === 'LOCAL') {
      this.log('INFO', 'Running local validation (API integration disabled)');
      const r = await this.local.validate(ctx);
      this.log(r.overallStatus === 'VALID' ? 'INFO' : 'WARN', `Local validation ${r.overallStatus}`, r.summary);
      return r;
    }
    try {
      this.log('INFO', 'Running backend validation');
      const r = await this.backend!.validate(ctx);
      this.log(r.overallStatus === 'VALID' ? 'INFO' : 'WARN', `Backend validation ${r.overallStatus}`, r.backend);
      return r;
    } catch (e) {
      const err = e as Error;
      if (this.options.fallbackToLocal) {
        this.log('WARN', `Backend validation unavailable (${err.message}); falling back to local validation`);
        const r = await this.local.validate(ctx);
        return {
          ...r,
          fallbackUsed: true,
          fallbackReason: err.message,
          checks: [
            { id: 'BACKEND_FALLBACK', name: 'Backend Validation', category: 'BACKEND', status: 'WARNING', description: `Backend unavailable — local fallback used. ${err.message}` },
            ...r.checks,
          ],
          summary: { ...r.summary, total: r.summary.total + 1, warnings: r.summary.warnings + 1 },
        };
      }
      this.log('ERROR', `Backend validation failed: ${err.message}`);
      if (err instanceof BackendUnavailableError && err.result) return err.result;
      throw err;
    }
  }
}
