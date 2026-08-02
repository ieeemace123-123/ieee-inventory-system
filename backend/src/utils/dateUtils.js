/**
 * Utility functions for consistent date formatting across backend.
 */

/**
 * Returns local YYYY-MM-DD date string using local timezone.
 * Avoids new Date().toISOString().split('T')[0] which returns UTC date,
 * preventing timezone misalignment bugs (e.g., UTC date lagging local date by 1 day).
 */
export function getTodayStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
