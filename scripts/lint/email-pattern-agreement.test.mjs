// The single-email-address rule (Plan 4 task B12) is written three times:
// the app's forms, the Cloud Functions' emails and firestore.rules. Each copy
// must be the same text, or the app could accept an address the rules refuse
// (or the server mail one the forms reject). The production audit script
// imports the server copy rather than keeping a fourth.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function jsPattern(path) {
  const match = read(path).match(/SINGLE_EMAIL_PATTERN =\s*\/(\^[^\n]*\$)\/;/);
  assert.ok(match, `${path}: SINGLE_EMAIL_PATTERN regex literal not found`);
  return match[1];
}

function rulesPattern() {
  const match = read('firestore.rules').match(/e\.matches\("([^"]*)"\)/);
  assert.ok(match, 'firestore.rules: isValidEmailOrEmpty matches() not found');
  return match[1];
}

test('the app, server and rules copies of the email pattern are identical', () => {
  const app = jsPattern('src/app/utilities/email-validation.ts');
  const server = jsPattern('functions/src/email-builders.ts');
  assert.equal(app, server, 'app vs server');
  assert.equal(server, rulesPattern(), 'server vs firestore.rules');
});

test('all three copies bound the length at 254', () => {
  assert.match(read('src/app/utilities/email-validation.ts'), /MAX_EMAIL_LENGTH = 254;/);
  assert.match(read('functions/src/email-builders.ts'), /MAX_EMAIL_LENGTH = 254;/);
  assert.match(read('firestore.rules'), /e\.size\(\) <= 254/);
});

test('the audit script uses the server copy, not its own', () => {
  const audit = read('scripts/db/email-audit.ts');
  assert.match(audit, /from '\.\.\/\.\.\/functions\/src\/email-builders\.ts'/);
  assert.doesNotMatch(audit, /SINGLE_EMAIL_PATTERN =/);
});

test('the shared pattern gives the expected results', () => {
  const re = new RegExp(jsPattern('functions/src/email-builders.ts'));
  for (const ok of ['a+b@x.co.uk', 'user@example.xn--p1ai', 'user@xn--80ak6aa92e.com']) {
    assert.equal(re.test(ok), true, ok);
  }
  for (const bad of ['a@b', 'a@x.com,b@y.com', 'a@x.com;b', 'a @x.com', 'a@x.com<b>', '"a"@x.com']) {
    assert.equal(re.test(bad), false, bad);
  }
});
