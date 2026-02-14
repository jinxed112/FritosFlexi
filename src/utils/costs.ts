import { FLEXI_CONSTANTS, type CostCalculation } from '@/types';

/**
 * Calculate the full cost breakdown for a shift
 */
export function calculateCost(
  hours: number,
  hourlyRate: number,
  isSundayOrHoliday: boolean = false
): CostCalculation {
  const baseSalary = hours * hourlyRate;

  const sundayPremium = isSundayOrHoliday
    ? Math.min(hours * FLEXI_CONSTANTS.SUNDAY_PREMIUM_PER_HOUR, FLEXI_CONSTANTS.SUNDAY_PREMIUM_MAX_PER_DAY)
    : 0;

  const totalSalary = baseSalary + sundayPremium;
  const employerContribution = totalSalary * FLEXI_CONSTANTS.EMPLOYER_CONTRIBUTION_RATE;
  const totalCost = totalSalary + employerContribution;
  const nowjobsEquivalent = hours * FLEXI_CONSTANTS.NOWJOBS_HOURLY_COST;
  const savings = nowjobsEquivalent - totalCost;

  return {
    base_salary: round2(baseSalary),
    sunday_premium: round2(sundayPremium),
    total_salary: round2(totalSalary),
    employer_contribution: round2(employerContribution),
    total_cost: round2(totalCost),
    nowjobs_equivalent: round2(nowjobsEquivalent),
    savings: round2(savings),
  };
}

/**
 * Calculate hours between two time strings (HH:MM)
 */
export function calculateHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // Overnight shift
  return round2(minutes / 60);
}

/**
 * Get the effective hourly rate based on date
 */
export function getEffectiveRate(date: string, customRate?: number): number {
  if (customRate) return customRate;
  const d = new Date(date);
  // Rate increase on March 1, 2026
  if (d >= new Date('2026-03-01')) {
    return FLEXI_CONSTANTS.MIN_HOURLY_RATE_MARCH_2026;
  }
  return FLEXI_CONSTANTS.MIN_HOURLY_RATE;
}

/**
 * Format currency for Belgian locale
 */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
