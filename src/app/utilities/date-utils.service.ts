import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DateUtils {
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
    const baseDate = timestamp.toDate();
    const date = new Date(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate()
    );
    return toIsoFormat(date);
  }
}

export const toIsoFormat = DateUtils.toIsoFormat;
export const timestampToIsoDateString = DateUtils.timestampToIsoDateString;
