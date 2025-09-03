import { Injectable } from '@angular/core';
import { evaluate } from 'mathjs';

@Injectable({
  providedIn: 'root',
})
export class StringUtils {
  toNumber(str: string): number {
    try {
      const result = evaluate(str === '' ? '0' : str);
      return +Number(result).toFixed(2);
    } catch {
      return 0;
    }
  }
}
