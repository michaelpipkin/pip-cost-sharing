import { describe, expect, it } from 'vitest';
import { callableError } from './callable-error.util';

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
