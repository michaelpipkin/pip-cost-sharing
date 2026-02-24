import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SortingService {
  constructor() {}

  sort(data: any[], col: string, asc: boolean, property: string = '') {
    if (typeof data[0][col] === 'object' && property) {
      data = data.sort(function (a: any, b: any) {
        if (asc) {
          return a[col][property]?.toLowerCase() >
            b[col][property]?.toLowerCase()
            ? 1
            : a[col][property]?.toLowerCase() < b[col][property]?.toLowerCase()
              ? -1
              : 0;
        } else {
          return b[col][property]?.toLowerCase() >
            a[col][property]?.toLowerCase()
            ? 1
            : b[col][property]?.toLowerCase() < a[col][property]?.toLowerCase()
              ? -1
              : 0;
        }
      });
    } else if (typeof data[0][col] === 'string') {
      data = data.sort(function (a: any, b: any) {
        if (asc) {
          return a[col].toLowerCase() > b[col].toLowerCase()
            ? 1
            : a[col].toLowerCase() < b[col].toLowerCase()
              ? -1
              : 0;
        } else {
          return b[col].toLowerCase() > a[col].toLowerCase()
            ? 1
            : b[col].toLowerCase() < a[col].toLowerCase()
              ? -1
              : 0;
        }
      });
    } else {
      data = data.sort(function (a: any, b: any) {
        if (asc) {
          return a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0;
        } else {
          return b[col] > a[col] ? 1 : b[col] < a[col] ? -1 : 0;
        }
      });
    }
    return data;
  }
}
