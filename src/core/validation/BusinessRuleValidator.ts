import type { ValidationCheck } from '../types';
import type { ValidationContext } from './types';
import { CURRENCIES } from '../config/defaults';
import { SPEC_MANDATORY_TAGS } from '../cpm/tags';

function collectTags(nodes: ValidationContext['parsed']['nodes'], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    out.add(n.tag);
    if (n.children) collectTags(n.children, out);
  }
  return out;
}

/** Parses YYMMDDhhmmss (or YYYYMMDDhhmmss). */
export function parseCompactTimestamp(v: string): Date | undefined {
  const m = /^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const d = new Date(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const DUPLICATE_BLOCKING = ['APPROVED', 'PROCESSING'];

/**
 * Business Rule Validator — merchant-configurable rules (allowed IDs, limits, currencies,
 * duplicates, expiry...). Independent from the specification rules.
 */
export class BusinessRuleValidator {
  validate(ctx: ValidationContext): ValidationCheck[] {
    const { parsed, merchant, config } = ctx;
    const f = parsed.fields;
    const checks: ValidationCheck[] = [];
    const now = ctx.now ?? new Date();

    // Merchant status
    checks.push({
      id: 'MERCHANT_STATUS',
      name: 'Merchant Status',
      category: 'BUSINESS',
      status: merchant.status === 'ACTIVE' ? 'PASS' : 'FAIL',
      description: merchant.status === 'ACTIVE' ? 'Merchant is active' : `Merchant status is ${merchant.status}`,
    });

    // Merchant ID — CPM payloads normally do not carry the merchant; the terminal configuration is used.
    const mid = f.merchantId ?? merchant.merchantId;
    const midSource = f.merchantId ? 'QR payload (9F16)' : 'terminal configuration';
    let midStatus: ValidationCheck['status'] = 'PASS';
    let midDesc = `Merchant ID ${mid} recognized (${midSource})`;
    if (!mid || !/^[A-Za-z0-9]{1,15}$/.test(mid)) {
      midStatus = 'FAIL';
      midDesc = `Merchant ID "${mid ?? ''}" is empty or has an invalid format (1-15 alphanumeric)`;
    } else if (f.merchantId && f.merchantId !== merchant.merchantId) {
      midStatus = 'FAIL';
      midDesc = `QR is bound to merchant ${f.merchantId}, but this terminal is ${merchant.merchantId}`;
    } else if (config.allowedMerchantIds.length && !config.allowedMerchantIds.includes(mid)) {
      midStatus = 'FAIL';
      midDesc = `Merchant ID ${mid} is not in the allowed list`;
    }
    checks.push({ id: 'MERCHANT_ID', name: 'Merchant ID', category: 'BUSINESS', status: midStatus, description: midDesc, actual: mid, expected: config.allowedMerchantIds.join(', ') || 'any' });

    // Terminal ID
    const tid = f.terminalId ?? merchant.terminalId;
    let tidStatus: ValidationCheck['status'] = 'PASS';
    let tidDesc = `Terminal ID ${tid} recognized`;
    if (!tid) {
      tidStatus = config.requireTerminalId ? 'FAIL' : 'SKIPPED';
      tidDesc = config.requireTerminalId ? 'Terminal ID is required but not configured' : 'Terminal ID not required';
    } else if (!/^[A-Za-z0-9]{1,16}$/.test(tid)) {
      tidStatus = 'FAIL';
      tidDesc = `Terminal ID "${tid}" has an invalid format`;
    } else if (f.terminalId && f.terminalId !== merchant.terminalId) {
      tidStatus = 'FAIL';
      tidDesc = `QR is bound to terminal ${f.terminalId}, but this terminal is ${merchant.terminalId}`;
    } else if (config.allowedTerminalIds.length && !config.allowedTerminalIds.includes(tid)) {
      tidStatus = 'FAIL';
      tidDesc = `Terminal ID ${tid} is not in the allowed list`;
    }
    checks.push({ id: 'TERMINAL_ID', name: 'Terminal ID', category: 'BUSINESS', status: tidStatus, description: tidDesc, actual: tid });

    // Application Identifier
    const aids = f.applications.map((a) => a.aid).filter(Boolean) as string[];
    if (!aids.length) {
      checks.push({ id: 'APPLICATION_IDENTIFIER', name: 'Application Identifier', category: 'BUSINESS', status: 'FAIL', description: 'No Application Identifier to check' });
    } else if (!config.supportedAids.length) {
      checks.push({ id: 'APPLICATION_IDENTIFIER', name: 'Application Identifier', category: 'BUSINESS', status: 'WARNING', description: 'No supported AIDs configured — any AID accepted', actual: aids.join(', ') });
    } else {
      const match = aids.find((a) => config.supportedAids.some((s) => a.toUpperCase().startsWith(s.toUpperCase())));
      checks.push({
        id: 'APPLICATION_IDENTIFIER',
        name: 'Application Identifier',
        category: 'BUSINESS',
        status: match ? 'PASS' : 'FAIL',
        description: match ? `Supported identifier ${match}` : `Unsupported AID ${aids.join(', ')}`,
        expected: config.supportedAids.join(', '),
        actual: aids.join(', '),
      });
    }

    // Mandatory / optional fields
    const tags = collectTags(parsed.nodes);
    const extraMandatory = config.mandatoryTags.map((t) => t.toUpperCase()).filter((t) => !SPEC_MANDATORY_TAGS.includes(t as (typeof SPEC_MANDATORY_TAGS)[number]));
    const missingMandatory = extraMandatory.filter((t) => !tags.has(t));
    checks.push({
      id: 'MANDATORY_FIELDS',
      name: 'Mandatory Fields',
      category: 'BUSINESS',
      status: !extraMandatory.length ? 'SKIPPED' : missingMandatory.length ? 'FAIL' : 'PASS',
      description: !extraMandatory.length ? 'No additional mandatory fields configured' : missingMandatory.length ? `Missing mandatory tag(s): ${missingMandatory.join(', ')}` : `All configured mandatory tags present (${extraMandatory.join(', ')})`,
    });
    const missingOptional = config.optionalTags.map((t) => t.toUpperCase()).filter((t) => !tags.has(t));
    checks.push({
      id: 'OPTIONAL_FIELDS',
      name: 'Optional Fields',
      category: 'BUSINESS',
      status: !config.optionalTags.length ? 'SKIPPED' : missingOptional.length ? 'WARNING' : 'PASS',
      description: !config.optionalTags.length ? 'No optional fields configured' : missingOptional.length ? `Optional tag(s) absent: ${missingOptional.join(', ')}` : 'All expected optional tags present',
    });

    // Amount
    const amount = ctx.amount;
    let amtStatus: ValidationCheck['status'] = 'PASS';
    let amtDesc = `Amount ${amount} within limits`;
    if (!Number.isFinite(amount) || amount <= 0) {
      amtStatus = 'FAIL';
      amtDesc = 'Amount must be a positive number';
    } else if (Math.round(amount * 100) !== amount * 100) {
      amtStatus = 'FAIL';
      amtDesc = 'Amount has more than 2 decimal places';
    } else if (amount < config.minAmount) {
      amtStatus = 'FAIL';
      amtDesc = `Amount ${amount} is below minimum ${config.minAmount}`;
    } else if (amount > config.maxAmount) {
      amtStatus = 'FAIL';
      amtDesc = `Amount ${amount} exceeds maximum ${config.maxAmount}`;
    } else if (f.amount !== undefined && f.amount !== amount) {
      amtStatus = 'WARNING';
      amtDesc = `Entered amount ${amount} differs from amount in QR (${f.amount})`;
    }
    checks.push({ id: 'AMOUNT', name: 'Transaction Amount', category: 'BUSINESS', status: amtStatus, description: amtDesc, expected: `${config.minAmount} – ${config.maxAmount}`, actual: String(amount) });

    // Currency
    const currency = f.currencyCode ?? ctx.currency ?? merchant.currencyNumeric;
    const alpha = CURRENCIES[currency] ?? currency;
    const supported = config.supportedCurrencies.some((c) => c.toUpperCase() === currency.toUpperCase() || c.toUpperCase() === alpha.toUpperCase());
    checks.push({
      id: 'CURRENCY',
      name: 'Currency Code',
      category: 'BUSINESS',
      status: supported ? 'PASS' : 'FAIL',
      description: supported ? `Supported currency ${alpha}` : `Currency ${alpha} is not supported`,
      expected: config.supportedCurrencies.join(', '),
      actual: currency,
    });

    // Duplicate detection
    if (!config.duplicateDetection) {
      checks.push({ id: 'DUPLICATE', name: 'Duplicate Check', category: 'BUSINESS', status: 'SKIPPED', description: 'Duplicate detection disabled' });
    } else {
      const dupes = ctx.history.findByPayloadHash(parsed.payloadHash).filter((t) => DUPLICATE_BLOCKING.includes(t.status));
      const refDupes = f.transactionReference ? ctx.history.findByReference(f.transactionReference).filter((t) => DUPLICATE_BLOCKING.includes(t.status)) : [];
      const dup = dupes[0] ?? refDupes[0];
      checks.push({
        id: 'DUPLICATE',
        name: 'Duplicate Check',
        category: 'BUSINESS',
        status: dup ? 'FAIL' : 'PASS',
        description: dup ? `Duplicate: payload already used by transaction ${dup.transactionId} (${dup.status})` : 'No duplicate transaction',
        detail: 'CPM QR codes are single-use; a payload already approved (or in progress) is rejected.',
      });
    }

    // Expiry
    if (config.expiryTag && f.expiry) {
      const exp = parseCompactTimestamp(f.expiry);
      checks.push({
        id: 'EXPIRY',
        name: 'QR Expiration',
        category: 'BUSINESS',
        status: !exp ? 'FAIL' : exp.getTime() < now.getTime() ? 'FAIL' : 'PASS',
        description: !exp ? `Expiry value "${f.expiry}" in tag ${config.expiryTag} is not YYMMDDhhmmss` : exp.getTime() < now.getTime() ? `QR expired at ${exp.toISOString()}` : `QR valid until ${exp.toISOString()}`,
      });
    } else if (config.payloadExpirySeconds > 0 && ctx.firstSeenAt) {
      const age = (now.getTime() - new Date(ctx.firstSeenAt).getTime()) / 1000;
      checks.push({
        id: 'EXPIRY',
        name: 'QR Expiration',
        category: 'BUSINESS',
        status: age > config.payloadExpirySeconds ? 'FAIL' : 'PASS',
        description: age > config.payloadExpirySeconds ? `QR first scanned ${Math.round(age)}s ago; validity window is ${config.payloadExpirySeconds}s` : `QR within validity window (${Math.round(age)}s / ${config.payloadExpirySeconds}s)`,
      });
    } else {
      checks.push({ id: 'EXPIRY', name: 'QR Expiration', category: 'BUSINESS', status: 'SKIPPED', description: 'No expiry information available in payload or configuration' });
    }

    // Luhn (optional)
    if (config.luhnCheck) {
      checks.push({
        id: 'LUHN',
        name: 'PAN Check Digit (Luhn)',
        category: 'BUSINESS',
        status: f.panLuhnValid === undefined ? 'SKIPPED' : f.panLuhnValid ? 'PASS' : 'FAIL',
        description: f.panLuhnValid === undefined ? 'No PAN to check' : f.panLuhnValid ? 'PAN check digit valid' : 'PAN fails the Luhn check digit',
      });
    }

    return checks;
  }
}
