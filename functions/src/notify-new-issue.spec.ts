import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callable.
import { notifyNewIssue } from './index';
import { uniqueId } from './test-fixtures';

// Every mail goes to the one admin address, so each test uses a unique issue
// title and finds its mail by the subject that title produces.

const db = getFirestore();

function notify(data: unknown, auth?: { uid: string }) {
  return Promise.resolve(
    notifyNewIssue.run({
      auth: auth ? { ...auth, token: {} } : undefined,
      data,
    } as any)
  );
}

async function mailWithSubject(subject: string) {
  const snap = await db
    .collection('mail')
    .where('message.subject', '==', subject)
    .get();
  return snap.docs.map((d) => d.data());
}

const issue = (title: string) => ({
  number: 42,
  url: 'https://github.com/example/repo/issues/42',
  title,
});

describe('notifyNewIssue: validation', () => {
  it.each([
    ['number', { url: 'https://x.test/1', title: 't' }],
    ['url', { number: 1, title: 't' }],
    ['title', { number: 1, url: 'https://x.test/1' }],
  ])('rejects a call without %s as invalid-argument', async (_label, data) => {
    await expect(notify(data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('notifyNewIssue: the notification', () => {
  it('mails the admin without needing a signed-in caller', async () => {
    const title = uniqueId('Crash on save');

    await expect(notify(issue(title))).resolves.toEqual({ success: true });

    const mail = await mailWithSubject(`New PipSplit issue #42: ${title}`);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.['to']).toBe('admin@pipsplit.com');
    expect(mail[0]?.['message'].text).toContain(`Title: ${title}`);
    expect(mail[0]?.['message'].text).toContain(
      'View it on GitHub: https://github.com/example/repo/issues/42'
    );
    expect(mail[0]?.['message'].html).toContain('View Issue #42 on GitHub');
  });

  it('works the same for a signed-in caller', async () => {
    const title = uniqueId('Signed in');

    await expect(
      notify(issue(title), { uid: uniqueId('u') })
    ).resolves.toEqual({ success: true });

    expect(
      await mailWithSubject(`New PipSplit issue #42: ${title}`)
    ).toHaveLength(1);
  });

  it('HTML-escapes the title, body, reporter and url in the html part', async () => {
    const id = uniqueId('esc');
    const title = `<b>Bold</b> & "quoted" ${id}`;

    await notify({
      number: 7,
      url: 'https://x.test/?a=1&b="2"',
      title,
      body: '<script>alert(1)</script>',
      reporterEmail: 'rep<orter>@x.test',
    });

    const [mail] = await mailWithSubject(`New PipSplit issue #7: ${title}`);
    // The subject and plain text carry the title as typed.
    expect(mail?.['message'].text).toContain(`Title: ${title}`);
    const html: string = mail?.['message'].html;
    expect(html).toContain(
      `&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot; ${id}`
    );
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('rep&lt;orter&gt;@x.test');
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Bold</b>');
  });

  it('includes the reporter and body sections only when given', async () => {
    const withTitle = uniqueId('with');
    const withoutTitle = uniqueId('without');

    await notify({
      ...issue(withTitle),
      body: 'Steps to reproduce',
      reporterEmail: 'reporter@x.test',
    });
    await notify(issue(withoutTitle));

    const [full] = await mailWithSubject(`New PipSplit issue #42: ${withTitle}`);
    expect(full?.['message'].html).toContain('Reported by:');
    expect(full?.['message'].html).toContain('reporter@x.test');
    expect(full?.['message'].html).toContain('Steps to reproduce');
    expect(full?.['message'].text).toContain('Reported by: reporter@x.test');
    expect(full?.['message'].text).toContain('Steps to reproduce');

    const [bare] = await mailWithSubject(
      `New PipSplit issue #42: ${withoutTitle}`
    );
    expect(bare?.['message'].html).not.toContain('Reported by:');
    expect(bare?.['message'].html).not.toContain('white-space:pre-wrap');
    expect(bare?.['message'].text).not.toContain('Reported by');
  });
});
