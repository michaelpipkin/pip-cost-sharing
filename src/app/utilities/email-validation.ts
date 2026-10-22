import {
  emailError,
  PathKind,
  SchemaPath,
  SchemaPathRules,
  validate,
} from '@angular/forms/signals';

/**
 * Exactly one email address: a dot-atom local part (no quotes, `<`, `>`,
 * `,`, `;` or whitespace, and no leading, trailing or doubled dot), one `@`,
 * then dot-separated domain labels (letters, digits, inner hyphens) ending
 * in a TLD of 2+ letters or a punycode TLD (`xn--...`). Lists such as
 * `a@x.com,b@y.com` never match. Non-ASCII addresses are refused.
 *
 * The same rule is written three times and must stay identical:
 *  - here (the app's forms that store or send to an address: add/edit member,
 *    account profile, register, help; plus canInvite and add-group);
 *  - functions/src/email-builders.ts `SINGLE_EMAIL_PATTERN` (server emails);
 *  - firestore.rules `isValidEmailOrEmpty` (member and user doc writes).
 * scripts/db/email-audit.ts imports the server copy for the production audit.
 *
 * Deliberate exception: login and forgot-password keep Angular's built-in
 * `email` validator (it already refuses lists). They store nothing and only
 * reach the account's own Firebase Auth address, so the stricter rule there
 * could only lock out accounts registered before it existed (ruling R6).
 * `[.]` is used for a literal dot so the text needs no escaping in the rules.
 * The 254-character bound is checked separately (RE2 has no lookahead).
 */
export const SINGLE_EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:[.][A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?[.])+(?:[A-Za-z]{2,}|xn--[A-Za-z0-9-]*[A-Za-z0-9])$/;

/** The longest address accepted (RFC 5321's path limit). */
export const MAX_EMAIL_LENGTH = 254;

/** Whether `value` is exactly one valid email address. */
export function isSingleEmailAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_EMAIL_LENGTH &&
    SINGLE_EMAIL_PATTERN.test(value)
  );
}

/**
 * Signal-forms validator: the field holds one valid email address. An empty
 * value passes, so each form keeps its own `required` for that. The error is
 * Angular's `email` kind, like the built-in `email()` validator it replaces.
 */
export function singleEmail<TPathKind extends PathKind = PathKind.Root>(
  path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
  config: { message: string }
): void {
  validate(path, ({ value }) => {
    const email = value();
    return email === '' || isSingleEmailAddress(email)
      ? null
      : emailError({ message: config.message });
  });
}
