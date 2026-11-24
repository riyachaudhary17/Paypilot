/**
 * Monetary normalization and validation utility for PayPilot backend.
 *
 * Enforces strict financial number precision:
 * - Accepts valid JavaScript numbers or clean numeric strings.
 * - Explicitly rejects missing (null/undefined/empty), invalid, or non-finite values (NaN, Infinity).
 * - Avoids silent zero-coercion.
 * - Always normalizes to a 2-decimal rounded number.
 */

export function parseMonetaryAmount(val: unknown, fieldName = 'amount'): number {
  if (val === null || val === undefined) {
    throw new TypeError(`Invalid monetary amount for '${fieldName}': value is missing (${String(val)})`);
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
    // Check if trimmed matches valid numeric syntax (allow optional leading sign and decimals)
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

export function parseQuantity(val: unknown, fieldName = 'quantity'): number {
  if (val === null || val === undefined) {
    throw new TypeError(`Invalid quantity for '${fieldName}': value is missing`);
  }
  let num: number;
  if (typeof val === 'number') {
    num = val;
  } else if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new TypeError(`Invalid quantity for '${fieldName}': '${val}' is not a valid positive number`);
    }
    num = Number(trimmed);
  } else {
    throw new TypeError(`Invalid quantity for '${fieldName}': expected number or numeric string, got ${typeof val}`);
  }

  if (!Number.isFinite(num) || Number.isNaN(num) || num <= 0) {
    throw new TypeError(`Invalid quantity for '${fieldName}': must be a positive finite number, got ${num}`);
  }
  return Math.round(num * 1000) / 1000;
}

export function formatCurrency(val: unknown, currency = 'USD'): string {
  const amount = parseMonetaryAmount(val, 'currency amount');
  const cleanCurrency = (currency || 'USD').toUpperCase().trim();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cleanCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${cleanCurrency} ${amount.toFixed(2)}`;
  }
}
