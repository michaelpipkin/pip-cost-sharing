// Guards against <button>s without a type inside a <form>.
//
// HTML gives a <button> with no type attribute type="submit". Inside a form,
// that makes it a candidate for the browser's own Enter-to-submit, which
// "clicks" the form's first submit button. Before 2026-10-20, a split row's
// delete button (and Edit Expense's remove-receipt button) came before Save,
// so Enter on Android - where the app's DefaultButtonDirective doesn't get to
// handle the key first - deleted splits instead of saving. Every button inside
// a form must say what it is: type="submit" for the Save button, type="button"
// for everything else.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const APP_DIR = join(import.meta.dirname, '..', '..', 'src', 'app');

/** `file:line` of every <button> without a type attribute inside a <form>. */
export function untypedButtonsInForms(html, file = 'template') {
  const forms = [];
  for (const match of html.matchAll(/<form\b/g)) {
    const end = html.indexOf('</form>', match.index);
    forms.push([match.index, end < 0 ? html.length : end]);
  }
  const found = [];
  for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
    const insideForm = forms.some(
      ([start, end]) => match.index > start && match.index < end
    );
    if (insideForm && !/\btype\s*=/.test(match[1])) {
      const line = html.slice(0, match.index).split('\n').length;
      found.push(`${file}:${line}`);
    }
  }
  return found;
}

test('finds a type-less button inside a form, and ignores typed or outside ones', () => {
  const html = [
    '<button>outside</button>',
    '<form>',
    '  <button type="button">typed</button>',
    '  <button',
    '    (click)="removeSplit(i)">untyped</button>',
    '  <button type="submit">Save</button>',
    '</form>',
  ].join('\n');

  assert.deepEqual(untypedButtonsInForms(html), ['template:4']);
});

test('every <button> inside a <form> in src/app has a type', () => {
  const templates = readdirSync(APP_DIR, { recursive: true })
    .filter((file) => file.endsWith('.html'))
    .map((file) => join(APP_DIR, file));

  const found = templates.flatMap((path) =>
    untypedButtonsInForms(
      readFileSync(path, 'utf8'),
      relative(join(APP_DIR, '..', '..'), path).replaceAll('\\', '/')
    )
  );

  assert.deepEqual(
    found,
    [],
    'Give these buttons type="button" (or type="submit" for the one Save button):'
  );
});
