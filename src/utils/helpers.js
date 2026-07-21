/**
 * Format a Date (or ISO string) to 'YYYY-MM-DD'
 */
export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Format a Date (or ISO string) to 'HH:MM:SS' in local time
 */
export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toTimeString().slice(0, 8); // 'HH:MM:SS'
}

/**
 * Group an array of row objects by dealer field
 * Returns { MBW: [...], CPS: [...], FPT: [...] }
 */
export function groupByDealer(rows) {
  return rows.reduce((acc, row) => {
    const key = row.dealer || 'UNKNOWN';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

/**
 * Parse a price string like '25.990.000đ', '25,990,000 ₫', '25990000'
 * Returns integer in VND, or NaN if not parseable
 */
export function parsePrice(priceStr) {
  if (!priceStr) return NaN;
  // Remove all non-digit characters then parse
  const digits = String(priceStr).replace(/[^\d]/g, '');
  return digits.length ? parseInt(digits, 10) : NaN;
}
