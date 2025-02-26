import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as formatFns } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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