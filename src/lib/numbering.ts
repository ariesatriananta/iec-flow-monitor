/**
 * Numbering utility functions for IECNET Admin System
 * All date operations use Asia/Jakarta (WIB) timezone
 */

const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII'
] as const;

/**
 * Convert month number (1-12) to Roman numeral
 */
export function romanMonth(month: number): string {
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12');
  }
  return ROMAN_MONTHS[month - 1];
}

/**
 * Pad sequence number to 3 digits (001, 002, etc.)
 */
export function padSeq(n: number): string {
  return n.toString().padStart(3, '0');
}

/**
 * Get month and year from a date in Asia/Jakarta timezone
 */
export function getJakartaMonthYear(date: Date): { month: number; year: number } {
  const jakartaDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return {
    month: jakartaDate.getMonth() + 1,
    year: jakartaDate.getFullYear()
  };
}

/**
 * Format date to DD/MM/YYYY in Jakarta timezone
 */
export function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  };
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

/**
 * Format currency to Indonesian Rupiah
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount).replace('IDR', 'Rp.');
}

/**
 * Generate proposal/contract number
 * Format: P.{SEQ}/{SERVICE_CODE}/AP.2137-{ENGAGEMENT_NO}/{MONTH_ROMAN}/{YEAR}
 * Example: P.001/A/AP.2137-1/XII/2025
 */
export function generateProposalNumber(params: {
  seqNo: number;
  serviceCode: 'A' | 'B';
  engagementNo: number;
  proposalDate: Date;
}): string {
  const { seqNo, serviceCode, engagementNo, proposalDate } = params;
  const { month, year } = getJakartaMonthYear(proposalDate);
  
  return `P.${padSeq(seqNo)}/${serviceCode}/AP.2137-${engagementNo}/${romanMonth(month)}/${year}`;
}

/**
 * Generate invoice number
 * Format: I.{SEQ}/AP.2137/{MONTH_ROMAN}/{YEAR}
 * Example: I.001/AP.2137/XII/2025
 */
export function generateInvoiceNumber(params: {
  seqNo: number;
  invoiceDate: Date;
}): string {
  const { seqNo, invoiceDate } = params;
  const { month, year } = getJakartaMonthYear(invoiceDate);
  
  return `I.${padSeq(seqNo)}/AP.2137/${romanMonth(month)}/${year}`;
}

/**
 * Generate letter number
 * Format: L.{SEQ}/AP.2137/{MONTH_ROMAN}/{YEAR}
 * Example: L.001/AP.2137/XII/2025
 */
export function generateLetterNumber(params: {
  seqNo: number;
  letterDate: Date;
  letterType: 'HRGA' | 'UMUM' | 'SURAT_TUGAS';
  hrgaCategory?: 'PERMANEN' | 'NON_PERMANEN' | 'INTERNSHIP';
}): string {
  const { seqNo, letterDate, letterType, hrgaCategory } = params;
  const { month, year } = getJakartaMonthYear(letterDate);

  if (letterType === 'HRGA') {
    const categoryLabel =
      hrgaCategory === 'NON_PERMANEN'
        ? 'Employee-B'
        : hrgaCategory === 'INTERNSHIP'
        ? 'Employee-C'
        : 'Employee-A';
    return `${padSeq(seqNo)}/AP.2137/${categoryLabel}/${romanMonth(month)}/${year}`;
  }

  return `L.${padSeq(seqNo)}/AP.2137/${romanMonth(month)}/${year}`;
}

/**
 * Calculate payment status based on termins
 */
export function calculatePaymentStatus(
  contractValue: number,
  paidAmount: number
): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paidAmount === 0) return 'UNPAID';
  if (paidAmount >= contractValue) return 'PAID';
  return 'PARTIAL';
}

/**
 * Calculate percentage progress
 */
export function calculatePercentage(amount: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((amount / total) * 100);
}
