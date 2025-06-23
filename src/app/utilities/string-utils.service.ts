import { Injectable } from '@angular/core';
import stringMath from 'string-math';

@Injectable({
  providedIn: 'root',
})
export class StringUtils {
  toNumber(str: string): number {
    try {
      return +stringMath(str).toFixed(2);
    } catch {
      return 0;
    }
  }
}
