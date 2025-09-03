import { Injectable } from '@angular/core';
import { evaluate } from 'mathjs';

@Injectable({
  providedIn: 'root',
})
export class StringUtils {
  toNumber(str: string): number {
    try {
      if (typeof str !== 'string' || str.trim() === '') {
        return 0;
      }

      const result = evaluate(str);

      if (
        result === null ||
        result === undefined ||
        Number.isNaN(result) ||
        !Number.isFinite(result) ||
        typeof result === 'object' ||
        Math.abs(result) > Number.MAX_SAFE_INTEGER
      ) {
        return 0;
      }

      return +Number(result).toFixed(2);
    } catch {
      return 0;
    }
  }
}
