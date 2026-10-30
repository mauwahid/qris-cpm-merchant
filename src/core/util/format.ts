export function formatAmount(amount: number | undefined, currency = 'IDR'): string {
  if (amount === undefined || Number.isNaN(amount)) return 'N/A';
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { hour12: false });
}

export function na(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
