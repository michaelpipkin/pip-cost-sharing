import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';
import moment from 'moment';

// Month and day, optionally followed by a year, separated by "/", "-" or ".".
const NUMERIC_DATE = /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d+))?$/;

@Injectable({
  providedIn: 'root',
})
export class CustomDateAdapter extends NativeDateAdapter {
  override parse(value: any): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const match = NUMERIC_DATE.exec(value.trim());
      if (match) {
        return this.#parseNumericDate(+match[1]!, +match[3]!, match[4]);
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
    let parsed: moment.Moment;
    if (year === undefined) {
      parsed = moment({ year: moment().year(), month: month - 1, date: day });
    } else if (year.length === 2) {
      parsed = moment(`${month}/${day}/${year}`, 'M/D/YY', true);
    } else if (year.length === 4) {
      parsed = moment({ year: +year, month: month - 1, date: day });
    } else {
      return new Date(Number.NaN);
    }
    return parsed.isValid() ? parsed.toDate() : new Date(Number.NaN);
  }
}
