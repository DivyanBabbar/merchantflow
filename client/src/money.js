const MAX_PRICE_PAISE = 21_474_836;

export function parseRupees(value) {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 && paise <= MAX_PRICE_PAISE ? paise : null;
}

export function formatRupees(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

