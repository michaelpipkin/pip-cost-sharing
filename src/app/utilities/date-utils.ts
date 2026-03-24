export function toIsoFormat(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(str: string): Date {
  const [year, month, day] = str.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}
