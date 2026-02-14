import { format, startOfWeek, addDays, isSameDay, isSunday } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Calculate Easter date for a given year (Meeus algorithm)
 */
export function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Get all Belgian public holidays for a given year
 */
export function getBelgianHolidays(year: number): Date[] {
  const easter = getEasterDate(year);

  return [
    new Date(year, 0, 1),   // Nouvel An
    new Date(year, 4, 1),   // Fête du travail
    new Date(year, 6, 21),  // Fête nationale
    new Date(year, 7, 15),  // Assomption
    new Date(year, 10, 1),  // Toussaint
    new Date(year, 10, 11), // Armistice
    new Date(year, 11, 25), // Noël
    addDays(easter, 1),     // Lundi de Pâques
    addDays(easter, 39),    // Ascension
    addDays(easter, 50),    // Lundi de Pentecôte
  ];
}

/**
 * Check if a date is a Sunday or Belgian public holiday
 */
export function isSundayOrHoliday(date: Date): boolean {
  if (isSunday(date)) return true;
  const holidays = getBelgianHolidays(date.getFullYear());
  return holidays.some((h) => isSameDay(h, date));
}

/**
 * Get the week days starting from Monday
 */
export function getWeekDays(referenceDate: Date): Date[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Format a date for display in Belgian French
 */
export function formatDateBE(date: Date | string, fmt: string = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, fmt, { locale: fr });
}

/**
 * Format a short day label
 */
export function formatDayShort(date: Date): string {
  return format(date, 'EEE', { locale: fr });
}

/**
 * Get month/year label
 */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: fr });
}
