import type { ValidationResult } from '../types';
import type { QrValidator, ValidationContext } from './types';
import { SpecificationValidator } from './SpecificationValidator';
import { BusinessRuleValidator } from './BusinessRuleValidator';
import { ValidationResultMapper } from './ValidationResultMapper';

/** Runs specification + business validation entirely in the browser. Never performs HTTP. */
export class LocalValidationEngine implements QrValidator {
  constructor(
    private readonly spec = new SpecificationValidator(),
    private readonly business = new BusinessRuleValidator(),
  ) {}

  async validate(ctx: ValidationContext): Promise<ValidationResult> {
    return this.validateSync(ctx);
  }

  validateSync(ctx: ValidationContext): ValidationResult {
    const started = performance.now();
    const specChecks = this.spec.validate(ctx.parsed, { crcProfile: ctx.config.crcProfile, strictMode: ctx.config.strictMode });
    const structuralFail = specChecks.some((c) => c.category === 'PAYLOAD' && c.status === 'FAIL');
    const businessChecks = structuralFail
      ? [{ id: 'BUSINESS_RULES', name: 'Business Rules', category: 'BUSINESS' as const, status: 'SKIPPED' as const, description: 'Skipped: payload failed structural validation' }]
      : this.business.validate(ctx);
    return ValidationResultMapper.fromChecks([...specChecks, ...businessChecks], 'LOCAL', ctx.parsed.payloadHash, started);
  }
}
