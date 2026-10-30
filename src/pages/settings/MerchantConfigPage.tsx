import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Form';
import { toast } from '@/components/ui/Toast';
import { useConfigStore } from '@/store/configStore';
import { useDraft } from '@/hooks';
import type { MerchantConfig } from '@/core/config/types';

export function MerchantConfigPage() {
  const merchant = useConfigStore((s) => s.merchant);
  const update = useConfigStore((s) => s.updateMerchant);
  const resetSection = useConfigStore((s) => s.resetSection);
  const { draft, patch, dirty, reset } = useDraft<MerchantConfig>(merchant);

  const errors: Partial<Record<keyof MerchantConfig, string>> = {};
  if (!/^[A-Za-z0-9]{1,15}$/.test(draft.merchantId)) errors.merchantId = '1–15 alphanumeric characters';
  if (!/^[A-Za-z0-9]{1,16}$/.test(draft.terminalId)) errors.terminalId = '1–16 alphanumeric characters';
  if (!/^\d{4}$/.test(draft.merchantCategoryCode)) errors.merchantCategoryCode = '4 digits (ISO 18245)';
  if (!/^\d{3}$/.test(draft.currencyNumeric)) errors.currencyNumeric = '3 digits (ISO 4217 numeric)';
  if (!/^[A-Z]{3}$/.test(draft.currency)) errors.currency = '3 letters (ISO 4217 alpha)';
  if (!/^[A-Z]{2}$/.test(draft.countryCode)) errors.countryCode = '2 letters (ISO 3166-1)';
  if (!draft.merchantName.trim()) errors.merchantName = 'Required';
  const valid = Object.keys(errors).length === 0;

  return (
    <div>
      <PageHeader
        title="Merchant Configuration"
        description="Terminal identity used for every transaction. In CPM the merchant/terminal data comes from the terminal, not from the customer's QR."
        actions={<Button variant="outline" onClick={() => { resetSection('merchant'); toast.info('Merchant configuration reset'); }}>Reset to Default</Button>}
      />
      <Card>
        <CardHeader title="Merchant & Terminal" />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="Merchant Name" error={errors.merchantName}><Input value={draft.merchantName} maxLength={25} onChange={(e) => patch({ merchantName: e.target.value })} /></Field>
          <Field label="Merchant ID" error={errors.merchantId}><Input className="mono" value={draft.merchantId} onChange={(e) => patch({ merchantId: e.target.value.trim() })} /></Field>
          <Field label="Terminal ID" error={errors.terminalId}><Input className="mono" value={draft.terminalId} onChange={(e) => patch({ terminalId: e.target.value.trim() })} /></Field>
          <Field label="Merchant Category Code" error={errors.merchantCategoryCode}><Input className="mono" value={draft.merchantCategoryCode} onChange={(e) => patch({ merchantCategoryCode: e.target.value.trim() })} /></Field>
          <Field label="Merchant City"><Input value={draft.merchantCity} onChange={(e) => patch({ merchantCity: e.target.value })} /></Field>
          <Field label="Merchant Status">
            <Select value={draft.status} onChange={(e) => patch({ status: e.target.value as MerchantConfig['status'] })}>
              <option>ACTIVE</option><option>INACTIVE</option><option>SUSPENDED</option>
            </Select>
          </Field>
          <Field label="Country Code" error={errors.countryCode}><Input className="mono" value={draft.countryCode} onChange={(e) => patch({ countryCode: e.target.value.toUpperCase() })} /></Field>
          <Field label="Currency (alpha)" error={errors.currency}><Input className="mono" value={draft.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Currency (numeric)" error={errors.currencyNumeric}><Input className="mono" value={draft.currencyNumeric} onChange={(e) => patch({ currencyNumeric: e.target.value.trim() })} /></Field>
          <Field label="Default Amount" hint="Pre-filled after each scan"><NumberInput min={0} value={draft.defaultAmount} onChange={(n) => patch({ defaultAmount: n })} /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="outline" disabled={!dirty} onClick={reset}>Discard</Button>
          <Button disabled={!dirty || !valid} onClick={() => { update(draft); toast.success('Merchant configuration saved'); }}>Save</Button>
        </div>
      </Card>
      <p className="mt-3 text-xs text-slate-500">Tip: add the Merchant ID / Terminal ID to the allowed lists in Validation Configuration, or validation will fail with "not in the allowed list".</p>
    </div>
  );
}
