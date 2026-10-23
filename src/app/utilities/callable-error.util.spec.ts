import { describe, expect, it } from 'vitest';
import {
  callableError,
  isInvalidLoginEmailRefusal,
  isUnverifiedLoginRefusal,
} from './callable-error.util';

describe('callableError', () => {
  // The Functions SDK builds a server refusal as
  // new FunctionsError(code, `${message} [${httpStatus}]`).
  it('returns the code and the server message without the HTTP status', () => {
    const error = Object.assign(
      new Error('This link has expired or was already used. [400]'),
      { code: 'functions/failed-precondition' }
    );
    expect(callableError(error)).toEqual({
      code: 'functions/failed-precondition',
      message: 'This link has expired or was already used.',
    });
  });

  it('leaves a message without a status suffix alone', () => {
    const error = Object.assign(new Error('boom'), {
      code: 'functions/internal',
    });
    expect(callableError(error)).toEqual({
      code: 'functions/internal',
      message: 'boom',
    });
  });

  it('only strips a trailing three-digit status', () => {
    expect(callableError(new Error('Room [12] is full')).message).toBe(
      'Room [12] is full'
    );
  });

  it('handles values that are not errors', () => {
    expect(callableError('nope')).toEqual({ code: undefined, message: '' });
    expect(callableError(null)).toEqual({ code: undefined, message: '' });
  });
});

describe('isUnverifiedLoginRefusal', () => {
  const refusal = (code: string, message: string) =>
    Object.assign(new Error(message), { code });

  it('matches the member-email callables’ unverified-login refusal', () => {
    expect(
      isUnverifiedLoginRefusal(
        refusal(
          'functions/permission-denied',
          'Verify your login email first. [403]'
        )
      )
    ).toBe(true);
  });

  it('does not match another permission-denied refusal or another code', () => {
    expect(
      isUnverifiedLoginRefusal(
        refusal('functions/permission-denied', 'Not your member record [403]')
      )
    ).toBe(false);
    expect(
      isUnverifiedLoginRefusal(
        refusal('functions/internal', 'Verify your login email first.')
      )
    ).toBe(false);
    expect(isUnverifiedLoginRefusal('nope')).toBe(false);
  });
});

describe('isInvalidLoginEmailRefusal', () => {
  const refusal = (code: string, message: string) =>
    Object.assign(new Error(message), { code });

  it('matches updateMemberEmails’ invalid-login-email refusal', () => {
    expect(
      isInvalidLoginEmailRefusal(
        refusal(
          'functions/failed-precondition',
          'Your login email is not a single valid email address. [400]'
        )
      )
    ).toBe(true);
  });

  it('does not match another failed-precondition refusal or another code', () => {
    expect(
      isInvalidLoginEmailRefusal(
        refusal(
          'functions/failed-precondition',
          'This link has expired or was already used. [400]'
        )
      )
    ).toBe(false);
    expect(
      isInvalidLoginEmailRefusal(
        refusal(
          'functions/internal',
          'Your login email is not a single valid email address.'
        )
      )
    ).toBe(false);
    expect(isInvalidLoginEmailRefusal(null)).toBe(false);
  });
});
