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
    code: 'AUD',
    symbol: 'A$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Australian Dollar',
  },
  {
    code: 'BRL',
    symbol: 'R$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    name: 'Brazilian Real',
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
    code: 'CAD',
    symbol: 'C$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Canadian Dollar',
  },
  {
    code: 'CNY',
    symbol: '¥',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Chinese Yuan',
  },
  {
    code: 'DKK',
    symbol: 'kr',
    symbolPosition: 'suffix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    name: 'Danish Krone',
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
    code: 'INR',
    symbol: '₹',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Indian Rupee',
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
    code: 'MXN',
    symbol: 'MX$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Mexican Peso',
  },
  {
    code: 'NZD',
    symbol: 'NZ$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'New Zealand Dollar',
  },
  {
    code: 'NOK',
    symbol: 'kr',
    symbolPosition: 'suffix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    name: 'Norwegian Krone',
  },
  {
    code: 'SGD',
    symbol: 'S$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Singapore Dollar',
  },
  {
    code: 'ZAR',
    symbol: 'R',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'South African Rand',
  },
  {
    code: 'KRW',
    symbol: '₩',
    symbolPosition: 'prefix',
    decimalPlaces: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'South Korean Won',
  },
  {
    code: 'SEK',
    symbol: 'kr',
    symbolPosition: 'suffix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    name: 'Swedish Krona',
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
    code: 'USD',
    symbol: '$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'US Dollar',
  },
];

// Helper function to get currency config by code
export function getCurrencyConfig(code: string): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}
