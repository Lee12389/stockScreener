/** Formats a numeric value with a fixed number of decimal places. */
export function formatNumber(value: number | null | undefined, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return parsed.toFixed(digits);
}

/** Formats a signed numeric change for badges and PnL output. */
export function formatSigned(value: number | null | undefined, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(digits)}`;
}

/** Formats a number using compact Indian-style currency notation. */
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

/** Formats ISO-like timestamps for human-readable display. */
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
