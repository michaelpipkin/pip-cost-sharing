declare global {
  interface String {
    parseDate(): Date | null;
  }
}

String.prototype.parseDate = function (): Date | null {
  const str = this as string;
  const parts = str.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  return new Date(year, month - 1, day);
};

export {};
