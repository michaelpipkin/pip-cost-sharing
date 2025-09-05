import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class StringUtils {
  toNumber(str: string): number {
    try {
      if (typeof str !== 'string' || str.trim() === '') {
        return 0;
      }

      // Simple math expression evaluator using Function constructor
      // Sanitize input to only allow numbers, basic operators, parentheses, and decimals
      const sanitized = str.replace(/[^0-9+\-*/().\s]/g, '');
      
      if (sanitized !== str) {
        // If sanitization changed the string, it contained invalid characters
        return 0;
      }

      // Use Function constructor to safely evaluate simple math expressions
      const result = new Function('return (' + sanitized + ')')();

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
