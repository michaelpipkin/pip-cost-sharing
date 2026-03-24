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
        return copy.sort((a, b) =>
          this.compare(a[col][property], b[col][property], asc)
        );
      }
    } else if (typeof copy[0][col] === 'string') {
      return copy.sort((a, b) => {
        const aVal = a[col].toLowerCase();
        const bVal = b[col].toLowerCase();
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    } else {
      return copy.sort((a, b) => this.compare(a[col], b[col], asc));
    }
  }

  private compare(a: any, b: any, asc: boolean): number {
    if (a > b) return asc ? 1 : -1;
    if (a < b) return asc ? -1 : 1;
    return 0;
  }
}
