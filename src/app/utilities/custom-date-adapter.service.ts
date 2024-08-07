import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';
import moment from 'moment';

@Injectable({
  providedIn: 'root',
})
export class CustomDateAdapter extends NativeDateAdapter {
  parse(value: any): Date | null {
    if (typeof value === 'string' && value.length > 0) {
      const currentYear = moment().year();
      const parsedDate = moment(value, ['MM/DD', 'MM/DD/YYYY'], false);
      const containsYear = /\d{4}/.test(value);

      if (parsedDate.isValid() && !containsYear) {
        return parsedDate.year(currentYear).toDate();
      }
    }
    return super.parse(value);
  }
}
