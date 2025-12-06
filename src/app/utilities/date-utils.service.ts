import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DateUtils {
  /**
   * Converts a date to UTC midnight, removing timezone dependency
   * This ensures dates are stored consistently regardless of the user's timezone
   */
  static toUTCMidnight(date: Date): Date {
    return new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
    );
  }

  /**
   * Creates a Firebase Timestamp from a date at UTC midnight
   * Use this when storing dates to ensure timezone consistency
   */
  static toUTCTimestamp(date: Date): Timestamp {
    return Timestamp.fromDate(this.toUTCMidnight(date));
  }

  /**
   * Extracts just the date portion from a timestamp, ignoring timezone
   * Use this when displaying dates to ensure consistent date display
   */
  static getDateOnly(timestamp: Timestamp): Date {
    const date = timestamp.toDate();
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    );
  }

  /**
   * Helper method to check if a timestamp represents a UTC midnight date
   * Useful for detecting if a date was stored with the new UTC approach
   */
  static isUTCMidnight(timestamp: Timestamp): boolean {
    const date = timestamp.toDate();
    return (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
    );
  }

  /**
   * Formats a date as YYYY-MM-DD string
   */
  static toIsoFormat(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  static timestampToIsoDateString(timestamp: Timestamp): string {
    const date = DateUtils.getDateOnly(timestamp);
    return toIsoFormat(date);
  }
}

export const toIsoFormat = DateUtils.toIsoFormat;
export const timestampToIsoDateString = DateUtils.timestampToIsoDateString;
