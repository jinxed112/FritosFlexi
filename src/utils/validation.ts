/**
 * Validate Belgian NISS (national register number)
 * Format: XX.XX.XX-XXX.XX
 */
export function validateNISS(niss: string): boolean {
  const cleaned = niss.replace(/[\s.-]/g, '');
  if (cleaned.length !== 11) return false;
  if (!/^\d{11}$/.test(cleaned)) return false;

  // Modulo 97 check
  const base = parseInt(cleaned.substring(0, 9), 10);
  const check = parseInt(cleaned.substring(9, 11), 10);

  // Try with 19xx birth year
  if (97 - (base % 97) === check) return true;

  // Try with 20xx birth year (add 2000000000)
  if (97 - ((2000000000 + base) % 97) === check) return true;

  return false;
}

/**
 * Format NISS for display: XX.XX.XX-XXX.XX
 */
export function formatNISS(niss: string): string {
  const cleaned = niss.replace(/[\s.-]/g, '');
  if (cleaned.length !== 11) return niss;
  return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 4)}.${cleaned.slice(4, 6)}-${cleaned.slice(6, 9)}.${cleaned.slice(9, 11)}`;
}

/**
 * Validate Belgian IBAN
 * Format: BExx xxxx xxxx xxxx (BE + 14 digits)
 */
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (!/^BE\d{14}$/.test(cleaned)) return false;

  // IBAN modulo 97 check
  const rearranged = cleaned.slice(4) + '1114' + cleaned.slice(2, 4); // BE = 1114
  const numStr = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());

  // BigInt-style modulo for large numbers
  let remainder = 0;
  for (const digit of numStr) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  return remainder === 1;
}

/**
 * Format IBAN for display: BExx xxxx xxxx xxxx
 */
export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Validate Belgian phone number
 */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s.-]/g, '');
  return /^(\+32|0032|0)[1-9]\d{7,8}$/.test(cleaned);
}

/**
 * Validate email
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if all required profile fields are filled
 */
export function isProfileComplete(worker: {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  niss?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_zip?: string | null;
  phone?: string | null;
  email?: string;
  iban?: string | null;
  status?: string | null;
  framework_contract_date?: string | null;
}): boolean {
  return !!(
    worker.first_name?.trim() &&
    worker.last_name?.trim() &&
    worker.date_of_birth &&
    worker.niss?.trim() &&
    worker.address_street?.trim() &&
    worker.address_city?.trim() &&
    worker.address_zip?.trim() &&
    worker.phone?.trim() &&
    worker.email?.trim() &&
    worker.iban?.trim() &&
    worker.status &&
    worker.framework_contract_date
  );
}

/**
 * Count completed profile fields (for progress bar)
 */
export function profileCompletionCount(worker: Record<string, unknown>): { done: number; total: number } {
  const requiredFields = [
    'first_name', 'last_name', 'date_of_birth', 'niss',
    'address_street', 'address_city', 'address_zip',
    'phone', 'email', 'iban', 'status', 'framework_contract_date',
  ];
  const done = requiredFields.filter((f) => {
    const v = worker[f];
    return v !== null && v !== undefined && v !== '';
  }).length;
  return { done, total: requiredFields.length };
}
