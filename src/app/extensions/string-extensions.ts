declare global {
  interface String {
    parseDate(): Date | null;
  }
}

String.prototype.parseDate = function (): Date | null {
  const str = this as string;
  const [year, month, day] = str.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export {};
