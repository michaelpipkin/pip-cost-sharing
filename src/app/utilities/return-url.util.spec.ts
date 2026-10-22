import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { RETURN_URL_PARAM, safeReturnUrl } from './return-url.util';

describe('safeReturnUrl', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  const serialized = (raw: string | null | undefined) => {
    const tree = safeReturnUrl(router, raw);
    return tree && router.serializeUrl(tree);
  };

  it('names the login page parameter returnUrl', () => {
    expect(RETURN_URL_PARAM).toBe('returnUrl');
  });

  it.each([
    ['a plain path', '/administration/members'],
    ['a path with a query string', '/expenses?filter=open'],
    ['the group email confirmation link', '/auth/confirm-group-email?token=abc123'],
    ['a path with a fragment', '/help#tours'],
    ['the home page', '/'],
  ])('accepts %s and keeps it whole', (_label, raw) => {
    expect(serialized(raw)).toBe(raw);
  });

  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['a protocol-relative URL with a path', '//evil.com/expenses'],
    ['an absolute https URL', 'https://evil.com'],
    ['an absolute http URL', 'http://evil.com/expenses'],
    ['a backslash host', '/\\evil.com'],
    ['a backslash later in the path', '/expenses\\..\\evil'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', 'expenses'],
    ['a control character', '/ex\npenses'],
    ['an empty string', ''],
    ['whitespace before the slash', ' /expenses'],
    ['the login page (it would only bounce)', '/auth/login'],
    ['the login page with a query', '/auth/login?returnUrl=%2Fexpenses'],
    ['the register page', '/auth/register'],
  ])('refuses %s', (_label, raw) => {
    expect(safeReturnUrl(router, raw)).toBeNull();
  });

  it.each([[null], [undefined]])('refuses %s', (raw) => {
    expect(safeReturnUrl(router, raw)).toBeNull();
  });

  it('does not treat a path that merely starts like the login page as it', () => {
    expect(serialized('/auth/login-help')).toBe('/auth/login-help');
  });

  it('refuses a URL the router cannot parse', () => {
    expect(serialized('/%E0%A4%A')).toBeNull();
  });
});
