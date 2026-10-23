import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';
import moment from 'moment';

// Month and day, optionally followed by a year, separated by "/", "-" or ".".
// A trailing separator with no year ("3/17/") means no year.
const NUMERIC_DATE = /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d*))?$/;
// An ISO date with no time (yyyy-MM-dd, one-digit month or day allowed).
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

@Injectable({
  providedIn: 'root',
})
export class CustomDateAdapter extends NativeDateAdapter {
  override parse(value: any): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const text = value.trim();
      const match = NUMERIC_DATE.exec(text);
      if (match) {
        return this.#parseNumericDate(
          +match[1]!,
          +match[3]!,
          match[4] || undefined
        );
      }
      // Date.parse reads a date-only ISO string as UTC midnight, the day
      // before anywhere west of UTC, so it is built as a local date here.
      const iso = ISO_DATE.exec(text);
      if (iso) {
        return this.#localDate(+iso[1]!, +iso[2]!, +iso[3]!);
      }
    }
    return super.parse(value);
  }

  /**
   * Parses a typed month/day[/year]. Without a year it is the current year; a
   * four-digit year is taken as typed; a two-digit year follows moment's
   * default pivot (69-99 are 1969-1999, 00-68 are 2000-2068), so 25 is 2025
   * and 99 is 1999. Any other year length, and an impossible date such as
   * 2/30/25, gives an invalid Date (which the datepicker input reports as a
   * parse error) rather than rolling over into the next month.
   */
  #parseNumericDate(month: number, day: number, year?: string): Date {
    if (year === undefined) {
      return this.#localDate(moment().year(), month, day);
    }
    if (year.length === 4) {
      return this.#localDate(+year, month, day);
    }
    if (year.length === 2) {
      const parsed = moment(`${month}/${day}/${year}`, 'M/D/YY', true);
      return parsed.isValid() ? parsed.toDate() : new Date(Number.NaN);
    }
    return new Date(Number.NaN);
  }

  /**
   * Local midnight of that day (month 1-12), or an invalid Date for an
   * impossible one such as 2025-02-30, rather than a roll-over.
   */
  #localDate(year: number, month: number, day: number): Date {
    const parsed = moment({ year, month: month - 1, date: day });
    return parsed.isValid() ? parsed.toDate() : new Date(Number.NaN);
  }
}
