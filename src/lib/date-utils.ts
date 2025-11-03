/**
 * Date Utilities for gemiprintaio
 * Ensures consistent date handling across timezones
 * All dates are treated as Jakarta timezone (Asia/Jakarta, UTC+7)
 */

export const JAKARTA_TIMEZONE = "Asia/Jakarta";

/**
 * Get current date in Jakarta timezone as YYYY-MM-DD string
 * Use this for default date values in forms
 */
export function getTodayJakarta(): string {
  const now = new Date();
  const jakartaDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: JAKARTA_TIMEZONE,
  }).format(now);

  return jakartaDate; // Format: YYYY-MM-DD
}

/**
 * Format YYYY-MM-DD string to Indonesian readable format
 * Always interprets as Jakarta date regardless of user timezone
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted date like "02 Nov 2025"
 */
export function formatDateJakarta(dateString: string): string {
  if (!dateString) return "-";

  try {
    const [year, month, day] = dateString.split("-").map(Number);

    // Validate parsed values
    if (
      !year ||
      !month ||
      !day ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return dateString; // Return original if invalid
    }

    // Create date at noon Jakarta time to avoid any edge cases
    const date = new Date(Date.UTC(year, month - 1, day, 5, 0, 0)); // 12:00 Jakarta = 05:00 UTC

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: JAKARTA_TIMEZONE,
    }).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
}

/**
 * Format YYYY-MM-DD string to full Indonesian format with day name
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted date like "Sabtu, 02 November 2025"
 */
export function formatDateFullJakarta(dateString: string): string {
  if (!dateString) return "-";

  try {
    const [year, month, day] = dateString.split("-").map(Number);

    if (!year || !month || !day) {
      return dateString;
    }

    const date = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));

    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: JAKARTA_TIMEZONE,
    }).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
}

/**
 * Get timestamp in Jakarta timezone for display
 * @param isoString - ISO timestamp string
 * @returns Formatted datetime like "02 Nov 2025, 14:30"
 */
export function formatDateTimeJakarta(isoString: string): string {
  if (!isoString) return "-";

  try {
    const date = new Date(isoString);

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: JAKARTA_TIMEZONE,
    }).format(date);
  } catch (error) {
    console.error("Error formatting datetime:", error);
    return isoString;
  }
}

/**
 * Validate YYYY-MM-DD date string
 * @param dateString - Date string to validate
 * @returns true if valid YYYY-MM-DD format
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString) return false;

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const [year, month, day] = dateString.split("-").map(Number);

  // Basic validation
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check if date is valid (e.g., not Feb 30)
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Compare two YYYY-MM-DD date strings
 * @returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDates(date1: string, date2: string): number {
  return date1.localeCompare(date2);
}

/**
 * Get date range for month (first and last day)
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Object with startDate and endDate in YYYY-MM-DD format
 */
export function getMonthRange(
  year: number,
  month: number
): {
  startDate: string;
  endDate: string;
} {
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(
      lastDay
    ).padStart(2, "0")}`,
  };
}
