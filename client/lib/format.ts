export function formatNumber(value: number | null | undefined, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return parsed.toFixed(digits);
}

export function formatSigned(value: number | null | undefined, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(digits)}`;
}

export function formatCompactCurrency(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(parsed);
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
