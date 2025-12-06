import { Timestamp } from 'firebase/firestore';

declare module 'firebase/firestore' {
  interface Timestamp {
    toIsoDateString(): string;
  }
}

Timestamp.prototype.toIsoDateString = function (): string {
  const baseDate = this.toDate();
  const date = new Date(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate()
  );
  return date.toIsoFormat();
};
