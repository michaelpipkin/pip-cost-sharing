export interface CurrencyConfig {
  code: string; // ISO 4217 currency code (USD, EUR, GBP, etc.)
  symbol: string; // Currency symbol ($, €, £, ¥, etc.)
  symbolPosition: 'prefix' | 'suffix'; // Where to place symbol
  decimalPlaces: number; // Number of decimal places (2 for most, 0 for JPY)
  decimalSeparator: string; // '.' or ','
  thousandsSeparator: string; // ',' or '.' or ' '
  name: string; // Display name (US Dollar, Euro, etc.)
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  {
    code: 'USD',
    symbol: '$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'US Dollar',
  },
  {
    code: 'EUR',
    symbol: '€',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    name: 'Euro',
  },
  {
    code: 'GBP',
    symbol: '£',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'British Pound',
  },
  {
    code: 'JPY',
    symbol: '¥',
    symbolPosition: 'prefix',
    decimalPlaces: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Japanese Yen',
  },
  {
    code: 'CAD',
    symbol: 'C$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Canadian Dollar',
  },
  {
    code: 'AUD',
    symbol: 'A$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Australian Dollar',
  },
  {
    code: 'CHF',
    symbol: 'CHF',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Swiss Franc',
  },
  {
    code: 'INR',
    symbol: '₹',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Indian Rupee',
  },
  {
    code: 'MXN',
    symbol: 'MX$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Mexican Peso',
  },
];

// Helper function to get currency config by code
export function getCurrencyConfig(
  code: string
): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}