import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, NumberInput, Select, TagListEditor, Toggle } from '@/components/ui/Form';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { listTagDefinitions, SPEC_MANDATORY_TAGS } from '@/core/cpm/tags';
import type { CrcProfile } from '@/core/config/types';

const hexTag = (s: string) => (/^[0-9A-F]{2,8}$/.test(s) ? undefined : 'Tag must be 2–8 hex characters, e.g. 5F20');
const aid = (s: string) => (/^[0-9A-F]{10,32}$/.test(s) && s.length % 2 === 0 ? undefined : 'AID must be 5–16 bytes of hex (10–32 chars)');

export function ValidationConfigPage() {
  const v = useConfigStore((s) => s.validation);
  const update = useConfigStore((s) => s.updateValidation);
  const resetSection = useConfigStore((s) => s.resetSection);
  const upper = (s: string) => s.trim().toUpperCase();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Validation Configuration"
        description="Business rules are configurable here. Specification rules (EMVCo CPM structure) always run and cannot be disabled."
        actions={<Button variant="outline" onClick={() => { resetSection('validation'); toast.info('Validation rules reset'); }}>Reset to Default</Button>}
      />
      <Alert tone="info" title="Specification rules (always enforced)">
        Payload present · Base64/hex decoding · EMVCo CPM format · BER-TLV structure · Payload Format Indicator 85 = "CPV01" · Application Template 61 · ADF Name 4F · PAN 5A or Track 2 57 · field lengths · data formats · account data consistency.
        ASPI-specific requirements must be added below once verified against the official QRIS CPM specification.
      </Alert>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Fields" />
          <div className="space-y-5 p-5">
            <Field label="Mandatory Fields (tags)" hint="Locked tags are mandated by the specification. Add business-mandatory tags (hex), e.g. 5F20, 9F26.">
              <TagListEditor values={v.mandatoryTags} locked={[...SPEC_MANDATORY_TAGS]} onChange={(mandatoryTags) => update({ mandatoryTags })} transform={upper} validate={hexTag} placeholder="Tag, e.g. 9F26" />
            </Field>
            <Field label="Optional Fields (tags)" hint="Reported as WARNING when absent">
              <TagListEditor values={v.optionalTags} onChange={(optionalTags) => update({ optionalTags })} transform={upper} validate={hexTag} placeholder="Tag, e.g. 50" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Transaction Reference Tag" hint="Optional; verify with ASPI spec"><Input className="mono" value={v.transactionReferenceTag} onChange={(e) => update({ transactionReferenceTag: upper(e.target.value) })} placeholder="(not used)" /></Field>
              <Field label="Expiry Timestamp Tag" hint="YYMMDDhhmmss; verify with ASPI spec"><Input className="mono" value={v.expiryTag} onChange={(e) => update({ expiryTag: upper(e.target.value) })} placeholder="(not used)" /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Merchant & Application" />
          <div className="space-y-5 p-5">
            <Field label="Supported Application Identifiers (AID)" hint="Prefix match (EMV partial selection). Default is a SIMULATOR value — replace with the AID(s) from the official ASPI QRIS CPM specification.">
              <TagListEditor values={v.supportedAids} onChange={(supportedAids) => update({ supportedAids })} transform={upper} validate={aid} placeholder="e.g. A000000602…" />
            </Field>
            <Field label="Allowed Merchant IDs" hint="Empty = any merchant ID">
              <TagListEditor values={v.allowedMerchantIds} onChange={(allowedMerchantIds) => update({ allowedMerchantIds })} placeholder="Merchant ID" />
            </Field>
            <Field label="Allowed Terminal IDs" hint="Empty = any terminal ID">
              <TagListEditor values={v.allowedTerminalIds} onChange={(allowedTerminalIds) => update({ allowedTerminalIds })} placeholder="Terminal ID" />
            </Field>
            <Toggle checked={v.requireTerminalId} onChange={(requireTerminalId) => update({ requireTerminalId })} label="Terminal ID required" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Amount & Currency" />
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum Transaction Amount"><NumberInput min={0} value={v.minAmount} onChange={(minAmount) => update({ minAmount })} /></Field>
              <Field label="Maximum Transaction Amount" error={v.maxAmount < v.minAmount ? 'Must be ≥ minimum' : undefined}><NumberInput min={0} value={v.maxAmount} onChange={(maxAmount) => update({ maxAmount })} /></Field>
            </div>
            <Field label="Supported Currency" hint="ISO 4217 numeric or alpha codes (e.g. 360, IDR)">
              <TagListEditor values={v.supportedCurrencies} onChange={(supportedCurrencies) => update({ supportedCurrencies })} transform={upper} placeholder="e.g. 360" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Integrity, Duplicates & Expiry" />
          <div className="space-y-5 p-5">
            <Toggle checked={v.duplicateDetection} onChange={(duplicateDetection) => update({ duplicateDetection })} label="Duplicate Transaction Detection" description="Rejects a payload that was already approved or is being processed (CPM QRs are single-use)." />
            <Field label="QR Payload Expiration (seconds)" hint="Validity window from first scan; 0 = disabled. Used when no expiry tag is configured/present.">
              <NumberInput min={0} value={v.payloadExpirySeconds} onChange={(n) => update({ payloadExpirySeconds: Math.max(0, n) })} />
            </Field>
            <Field label="CRC Profile" hint="EMVCo CPM defines no CRC. This governs only the simulator's non-standard CRC tag DF7F.">
              <Select value={v.crcProfile} onChange={(e) => update({ crcProfile: e.target.value as CrcProfile })}>
                <option value="OPTIONAL">Optional — validate if present</option>
                <option value="REQUIRED">Required — fail if absent</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            </Field>
            <Toggle checked={v.strictMode} onChange={(strictMode) => update({ strictMode })} label="Strict Validation Mode" description="Unknown or misplaced tags FAIL instead of WARNING." />
            <Toggle checked={v.luhnCheck} onChange={(luhnCheck) => update({ luhnCheck })} label="PAN Luhn check" description="Fail when the PAN check digit is invalid (not mandated for all national PANs)." />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Tag Dictionary" subtitle="Data objects known to the parser (EMVCo CPM + EMV). Unknown tags are reported, not rejected (unless strict mode)." />
        <div className="max-h-[420px] overflow-auto">
          <table className="table-base">
            <thead><tr><th>Tag</th><th>Name</th><th>Format</th><th>Length</th><th>Allowed in</th><th>Source</th></tr></thead>
            <tbody>
              {listTagDefinitions().map((t) => (
                <tr key={t.tag}>
                  <td className="mono font-semibold text-blue-700">{t.tag}</td>
                  <td>{t.name} {t.sensitive && <Badge tone="red">SENSITIVE</Badge>}</td>
                  <td className="mono text-xs">{t.format}</td>
                  <td className="mono text-xs">{t.constructed ? 'var' : t.minLength === t.maxLength ? t.minLength : `${t.minLength}–${t.maxLength}`}</td>
                  <td className="mono text-xs">{t.allowedIn.join(', ')}</td>
                  <td><Badge tone={t.source === 'SIMULATOR' ? 'amber' : t.source === 'EMVCO_CPM' ? 'blue' : 'slate'}>{t.source}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
