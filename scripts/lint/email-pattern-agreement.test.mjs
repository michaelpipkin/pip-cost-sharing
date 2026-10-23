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

// The three specs each carry the example table (B12): the app and server
// copies run it in Vitest, the rules copy on the emulator (RE2). Every row
// must be in all three, so an RE2 difference on any row (uppercase, dot
// atoms, hyphen labels, a trailing newline, ...) is caught on the emulator,
// not inferred from the pattern text. Rows are compared as source text.
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;

function literals(block) {
  return [...block.matchAll(STRING_LITERAL)].map((m) => m[1] ?? m[2]);
}

function between(text, start, end, path) {
  const i = text.indexOf(start);
  assert.ok(i >= 0, `${path}: ${start} not found`);
  const j = text.indexOf(end, i + start.length);
  assert.ok(j >= 0, `${path}: ${end} not found after ${start}`);
  return text.slice(i + start.length, j);
}

/** Every second literal: the email of each [label, email] row. */
const emails = (pairs) => pairs.filter((_, i) => i % 2 === 1);

function exampleTables() {
  const appPath = 'src/app/utilities/email-validation.spec.ts';
  const app = read(appPath);
  const serverPath = 'functions/src/email-formatting.spec.ts';
  const server = read(serverPath).slice(
    read(serverPath).indexOf("describe('isSingleEmailAddress'")
  );
  const rulesPath = 'e2e/infra/email-rules.spec.ts';
  const rules = read(rulesPath);
  return {
    app: {
      valid: literals(between(app, 'const VALID = [', '];', appPath)),
      invalid: emails(
        literals(between(app, 'const INVALID: [string, string][] = [', '\n];', appPath))
      ),
    },
    server: {
      valid: literals(between(server, 'it.each([', "])('accepts", serverPath)),
      invalid: emails(
        literals(
          between(
            server.slice(server.indexOf("])('accepts")),
            'it.each([',
            "])('rejects",
            serverPath
          )
        )
      ),
    },
    rules: {
      valid: literals(between(rules, 'const VALID = [', '];', rulesPath)),
      invalid: literals(between(rules, 'const INVALID = [', '];', rulesPath)),
    },
  };
}

test('the app, server and rules specs run the same example table', () => {
  const { app, server, rules } = exampleTables();
  assert.ok(app.valid.length >= 9 && app.invalid.length >= 22, 'table parsed');
  assert.deepEqual(server.valid, app.valid, 'valid rows: server vs app');
  assert.deepEqual(server.invalid, app.invalid, 'invalid rows: server vs app');
  assert.deepEqual(rules.valid, app.valid, 'valid rows: rules vs app');
  // '' is how the rules clear an email, so the rules spec allows it
  // separately; every other invalid row must be refused on the emulator.
  assert.deepEqual(
    rules.invalid,
    app.invalid.filter((e) => e !== ''),
    'invalid rows: rules vs app'
  );
  assert.ok(
    app.valid.some((e) => e !== e.toLowerCase()),
    'the table keeps an uppercase row'
  );
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
