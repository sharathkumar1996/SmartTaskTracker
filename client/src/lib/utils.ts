import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as formatFns } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Payment method type constants
export const PAYMENT_METHODS = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  GOOGLE_PAY: 'google_pay',
  PHONE_PAY: 'phone_pay',
  ONLINE_PORTAL: 'online_portal'
};

// Human-friendly display names for payment methods
export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.CASH]: 'Cash',
  [PAYMENT_METHODS.BANK_TRANSFER]: 'Bank Transfer',
  [PAYMENT_METHODS.GOOGLE_PAY]: 'Google Pay',
  [PAYMENT_METHODS.PHONE_PAY]: 'Phone Pay',
  [PAYMENT_METHODS.ONLINE_PORTAL]: 'Online Portal'
};

export type PaymentMethod = 'cash' | 'bank_transfer' | 'google_pay' | 'phone_pay' | 'online_portal';

/**
 * Normalize payment method string to ensure consistent handling
 * This helps fix issues where different casing causes payment method mismatches
 */
export function normalizePaymentMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  return method.toLowerCase().trim();
}

/**
 * Get the display name for a payment method
 */
export function getPaymentMethodDisplayName(method: string | null | undefined): string {
  const normalizedMethod = normalizePaymentMethod(method);
  if (!normalizedMethod) return 'Unknown';
  
  // @ts-ignore - We're checking if the key exists in PAYMENT_METHOD_LABELS
  return PAYMENT_METHOD_LABELS[normalizedMethod] || 'Unknown';
}

/**
 * Determine if a payment method is a digital payment method
 */
export function isDigitalPaymentMethod(method: string | null | undefined): boolean {
  if (!method) {
    return false;
  }
  
  const normalizedMethod = normalizePaymentMethod(method);
  return [
    PAYMENT_METHODS.BANK_TRANSFER,
    PAYMENT_METHODS.GOOGLE_PAY,
    PAYMENT_METHODS.PHONE_PAY, 
    PAYMENT_METHODS.ONLINE_PORTAL
  ].indexOf(normalizedMethod!) >= 0;
}

/**
 * Determine if a payment method is cash
 */
export function isCashPaymentMethod(method: string | null | undefined): boolean {
  if (!method) {
    return false;
  }
  
  return normalizePaymentMethod(method) === PAYMENT_METHODS.CASH;
}

/**
 * Group payments by method type (cash vs digital)
 */
export function groupPaymentsByMethodType(payments: Array<{ paymentMethod?: string | null }>): {
  cashPayments: number;
  digitalPayments: number;
  total: number;
} {
  let cashPayments = 0;
  let digitalPayments = 0;
  
  payments.forEach(payment => {
    if (isCashPaymentMethod(payment.paymentMethod)) {
      cashPayments++;
    } else if (isDigitalPaymentMethod(payment.paymentMethod)) {
      digitalPayments++;
    }
  });
  
  return { 
    cashPayments, 
    digitalPayments, 
    total: cashPayments + digitalPayments 
  };
}

/**
 * Safely parse an amount value to a number
 */
export function parseAmount(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined) {
    return 0;
  }
  
  try {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return isNaN(numAmount) ? 0 : numAmount;
  } catch (error) {
    console.error("Error parsing amount:", error);
    return 0;
  }
}

/**
 * Format a number or string as Indian Rupees (INR)
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "₹0";
  }

  // Convert string to number if needed
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  // Format using Intl.NumberFormat
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(numAmount);
}

/**
 * Format a date as a readable string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return "N/A";
  }

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return formatFns(dateObj, "dd MMM yyyy");
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
}