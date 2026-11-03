const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const formatDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// "9 June 1988" -> Date (UTC midnight). Returns null when it can't be read.
export function parseDate(s) {
  const m = String(s ?? '').trim().match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  const month = m && MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  return m && month >= 0 ? new Date(Date.UTC(+m[3], month, +m[1])) : null;
}

export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
