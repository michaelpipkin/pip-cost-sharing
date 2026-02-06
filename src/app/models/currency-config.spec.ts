import { describe, it, expect } from 'vitest';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from './currency-config.interface';

describe('getCurrencyConfig', () => {
  it('should return USD configuration', () => {
    const config = getCurrencyConfig('USD');
    expect(config).toBeDefined();
    expect(config!.symbol).toBe('$');
    expect(config!.symbolPosition).toBe('prefix');
    expect(config!.decimalPlaces).toBe(2);
    expect(config!.decimalSeparator).toBe('.');
    expect(config!.thousandsSeparator).toBe(',');
  });

  it('should return EUR configuration with comma decimal separator', () => {
    const config = getCurrencyConfig('EUR');
    expect(config).toBeDefined();
    expect(config!.symbol).toBe('€');
    expect(config!.symbolPosition).toBe('prefix');
    expect(config!.decimalSeparator).toBe(',');
    expect(config!.thousandsSeparator).toBe('.');
  });

  it('should return JPY with 0 decimal places', () => {
    const config = getCurrencyConfig('JPY');
    expect(config).toBeDefined();
    expect(config!.decimalPlaces).toBe(0);
    expect(config!.symbol).toBe('¥');
  });

  it('should return KRW with 0 decimal places', () => {
    const config = getCurrencyConfig('KRW');
    expect(config).toBeDefined();
    expect(config!.decimalPlaces).toBe(0);
    expect(config!.symbol).toBe('₩');
  });

  it('should return suffix-positioned currencies (DKK, NOK, SEK)', () => {
    for (const code of ['DKK', 'NOK', 'SEK']) {
      const config = getCurrencyConfig(code);
      expect(config).toBeDefined();
      expect(config!.symbolPosition).toBe('suffix');
      expect(config!.symbol).toBe('kr');
    }
  });

  it('should return "none" symbol position for OT2 and OTH', () => {
    const ot2 = getCurrencyConfig('OT2');
    expect(ot2!.symbolPosition).toBe('none');
    expect(ot2!.symbol).toBe('');
    expect(ot2!.decimalPlaces).toBe(2);

    const oth = getCurrencyConfig('OTH');
    expect(oth!.symbolPosition).toBe('none');
    expect(oth!.decimalPlaces).toBe(0);
  });

  it('should return undefined for invalid currency code', () => {
    expect(getCurrencyConfig('INVALID')).toBeUndefined();
    expect(getCurrencyConfig('')).toBeUndefined();
  });

  it('should have unique currency codes in SUPPORTED_CURRENCIES', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });

  it('should contain exactly 20 supported currencies', () => {
    expect(SUPPORTED_CURRENCIES.length).toBe(20);
  });
});
