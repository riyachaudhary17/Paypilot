/**
 * Frontend monetary utility for PayPilot.
 *
 * Normalizes values to numbers and formats using Intl.NumberFormat.
 * Rejects invalid, non-finite, or malformed numeric inputs.
 */

export function parseMonetaryAmount(val: unknown, fieldName = 'amount'): number {
  if (val === null || val === undefined) {
    throw new TypeError(`Invalid monetary amount for '${fieldName}': value is missing`);
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      throw new TypeError(`Invalid monetary amount for '${fieldName}': non-finite number (${val})`);
    }
    return Math.round(val * 100) / 100;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') {
      throw new TypeError(`Invalid monetary amount for '${fieldName}': empty string`);
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new TypeError(`Invalid monetary amount for '${fieldName}': '${val}' is not a valid numeric string`);
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      throw new TypeError(`Invalid monetary amount for '${fieldName}': failed to parse finite number from '${val}'`);
    }
    return Math.round(num * 100) / 100;
  }

  throw new TypeError(`Invalid monetary amount for '${fieldName}': expected number or numeric string, got ${typeof val}`);
}

/**
 * Formats a monetary value (number or numeric string) into a localized currency string.
 * Uses Intl.NumberFormat and handles dynamic currencies.
 */
export function formatMoney(val: unknown, currency = 'USD'): string {
  if (val === null || val === undefined) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase().trim(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }

  const num = parseMonetaryAmount(val, 'currency amount');
  const cleanCurrency = (currency || 'USD').toUpperCase().trim();

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cleanCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${cleanCurrency} ${num.toFixed(2)}`;
  }
}
