import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SortingService {
  sort(data: any[], col: string, asc: boolean, property: string = ''): any[] {
    if (!data.length) return data;

    const copy = [...data];

    if (typeof copy[0][col] === 'object' && property) {
      if (typeof copy[0][col][property] === 'string') {
        return copy.sort((a, b) => {
          const aVal = a[col][property]?.toLowerCase() ?? '';
          const bVal = b[col][property]?.toLowerCase() ?? '';
          return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
      } else {
        return copy.sort((a, b) => {
          const aVal = a[col][property];
          const bVal = b[col][property];
          return asc
            ? aVal > bVal
              ? 1
              : aVal < bVal
                ? -1
                : 0
            : bVal > aVal
              ? 1
              : bVal < aVal
                ? -1
                : 0;
        });
      }
    } else if (typeof copy[0][col] === 'string') {
      return copy.sort((a, b) => {
        const aVal = a[col].toLowerCase();
        const bVal = b[col].toLowerCase();
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    } else {
      return copy.sort((a, b) =>
        asc
          ? a[col] > b[col]
            ? 1
            : a[col] < b[col]
              ? -1
              : 0
          : b[col] > a[col]
            ? 1
            : b[col] < a[col]
              ? -1
              : 0
      );
    }
  }
}
