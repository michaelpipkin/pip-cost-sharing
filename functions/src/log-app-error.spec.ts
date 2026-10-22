import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callable.
import { logAppError } from './index';
import { uniqueId } from './test-fixtures';

// app_errors and admin_config/error_alerts are global. Every test logs under
// its own unique component and a unique alert address, finds its documents by
// those, and overwrites the one alert-config doc (never deleting anything).
// The count of recent errors is global, so "no mail" cases use a threshold far
// above anything the run can produce, and the "mail" cases use threshold 1 and
// assert the subject by shape rather than by an exact error count.

const db = getFirestore();
const configRef = db.collection('admin_config').doc('error_alerts');
const NEVER = 100_000;

type Payload = {
  component?: string;
  action?: string;
  message?: string;
  error?: string;
  additionalInfo?: string;
};

function log(data: unknown) {
  return Promise.resolve(logAppError.run({ data } as any));
}

// set() with no merge replaces the doc, so no earlier test's fields leak.
async function setConfig(config: Record<string, unknown>) {
  await configRef.set(config);
}

/** Alerting off: a test that only cares about the error doc uses this. */
const alertsOff = () => setConfig({ enabled: false });

function alertConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    threshold: 1,
    windowMinutes: 7,
    cooldownMinutes: 60,
    adminEmail: `alerts-${uniqueId('x')}@log-error.test`,
    ...overrides,
  };
}

async function loggedFor(component: string) {
  const snap = await db
    .collection('app_errors')
    .where('component', '==', component)
    .get();
  return snap.docs.map((d) => d.data());
}

async function alertsTo(adminEmail: string) {
  const snap = await db.collection('mail').where('to', '==', adminEmail).get();
  return snap.docs.map((d) => d.data());
}

afterAll(async () => {
  // Leave alerting off so a later spec's logAppError calls cannot mail.
  await alertsOff();
});

describe('logAppError: validation', () => {
  it.each([
    ['component', { action: 'a', message: 'm' }],
    ['action', { component: 'c', message: 'm' }],
    ['message', { component: 'c', action: 'a' }],
    ['an empty component', { component: '', action: 'a', message: 'm' }],
  ])('rejects a call without %s as invalid-argument', async (_label, data) => {
    await expect(log(data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('writes nothing for a rejected call', async () => {
    const component = uniqueId('rejected');

    await expect(
      log({ component, action: 'a' } satisfies Payload)
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(await loggedFor(component)).toHaveLength(0);
  });
});

describe('logAppError: the error document', () => {
  it('stores the required fields and a server timestamp, and no optional fields', async () => {
    const component = uniqueId('minimal');
    await alertsOff();

    await log({ component, action: 'save', message: 'it broke' });

    const [doc] = await loggedFor(component);
    expect(doc).toMatchObject({
      component,
      action: 'save',
      message: 'it broke',
    });
    expect(doc?.['timestamp']).toBeInstanceOf(Timestamp);
    expect('error' in doc!).toBe(false);
    expect('additionalInfo' in doc!).toBe(false);
  });

  it('stores error and additionalInfo when they are given', async () => {
    const component = uniqueId('full');
    await alertsOff();

    await log({
      component,
      action: 'save',
      message: 'it broke',
      error: 'TypeError: x',
      additionalInfo: '{"id":1}',
    });

    const [doc] = await loggedFor(component);
    expect(doc?.['error']).toBe('TypeError: x');
    expect(doc?.['additionalInfo']).toBe('{"id":1}');
  });
});

describe('logAppError: no alert', () => {
  const payload = (component: string): Payload => ({
    component,
    action: 'a',
    message: 'm',
  });

  it('sends no mail when there is no alert config', async () => {
    const component = uniqueId('noconfig');
    // Deleting the one config doc (not a collection) is the only way to reach
    // the no-config exit. There is no address to look mail up by in that
    // case, so this checks the call still succeeds, still logs, and does not
    // create the config.
    await configRef.delete();

    await expect(log(payload(component))).resolves.toBeUndefined();

    expect(await loggedFor(component)).toHaveLength(1);
    expect((await configRef.get()).exists).toBe(false);
  });

  it('sends no mail when alerting is disabled, even past the threshold', async () => {
    const adminEmail = `off-${uniqueId('x')}@log-error.test`;
    await setConfig(alertConfig({ enabled: false, adminEmail }));

    await log(payload(uniqueId('disabled')));

    expect(await alertsTo(adminEmail)).toHaveLength(0);
  });

  it('sends no mail when no admin email is configured', async () => {
    const config = alertConfig();
    const { adminEmail: _unused, ...withoutEmail } = config;
    await setConfig(withoutEmail);

    await log(payload(uniqueId('noaddr')));

    // Nothing to address it to, so lastAlertSent is never claimed either.
    expect((await configRef.get()).data()?.['lastAlertSent']).toBeUndefined();
  });

  it('sends no mail below the threshold', async () => {
    const config = alertConfig({ threshold: NEVER });
    await setConfig(config);

    await log(payload(uniqueId('below')));

    expect(await alertsTo(config.adminEmail)).toHaveLength(0);
    expect((await configRef.get()).data()?.['lastAlertSent']).toBeUndefined();
  });
});

describe('logAppError: the alert mail', () => {
  it('mails the admin once the threshold is reached and records lastAlertSent', async () => {
    const config = alertConfig();
    await setConfig(config);
    const id = uniqueId('alert');
    const component = `<i>${id}</i> & co`;
    const before = Date.now();

    await log({
      component,
      action: 'a"ction',
      message: '<script>x</script>',
      error: 'Err & <b>',
    });

    const mail = await alertsTo(config.adminEmail);
    expect(mail).toHaveLength(1);
    const { subject, text, html } = mail[0]!['message'];
    expect(subject).toMatch(
      /^PipSplit Error Alert: \d+ errors? in the last 7 minutes$/
    );
    expect(text).toContain('in PipSplit in the last 7 minute(s)');

    // The triggering call is the newest error, so it is in the summary and in
    // the "most recent" table, escaped.
    const escapedComponent = `&lt;i&gt;${id}&lt;/i&gt; &amp; co`;
    expect(html).toContain(`${escapedComponent} / a&quot;ction`);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Err &amp; &lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(`<i>${id}`);

    const sent = (await configRef.get()).data()?.['lastAlertSent'];
    expect(sent).toBeInstanceOf(Timestamp);
    expect(sent.toMillis()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('says "minute" in the singular for a one-minute window', async () => {
    const config = alertConfig({ windowMinutes: 1 });
    await setConfig(config);

    await log({ component: uniqueId('one'), action: 'a', message: 'm' });

    const [mail] = await alertsTo(config.adminEmail);
    expect(mail?.['message'].subject).toMatch(/ in the last 1 minute$/);
  });

  it('sends no second mail within the cooldown', async () => {
    const config = alertConfig({ cooldownMinutes: 60 });
    await setConfig(config);

    await log({ component: uniqueId('first'), action: 'a', message: 'm' });
    const claimed = (await configRef.get()).data()?.['lastAlertSent'];
    await log({ component: uniqueId('second'), action: 'a', message: 'm' });

    expect(await alertsTo(config.adminEmail)).toHaveLength(1);
    expect(
      (await configRef.get()).data()?.['lastAlertSent'].toMillis()
    ).toBe(claimed.toMillis());
  });

  it('sends nothing when an alert went out recently, whatever the count', async () => {
    const recent = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const config = alertConfig({ lastAlertSent: recent });
    await setConfig(config);

    await log({ component: uniqueId('cool'), action: 'a', message: 'm' });

    expect(await alertsTo(config.adminEmail)).toHaveLength(0);
    expect(
      (await configRef.get()).data()?.['lastAlertSent'].toMillis()
    ).toBe(recent.toMillis());
  });

  it('alerts again once the cooldown has passed', async () => {
    const old = Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
    const config = alertConfig({ lastAlertSent: old });
    await setConfig(config);

    await log({ component: uniqueId('after'), action: 'a', message: 'm' });

    expect(await alertsTo(config.adminEmail)).toHaveLength(1);
    expect(
      (await configRef.get()).data()?.['lastAlertSent'].toMillis()
    ).toBeGreaterThan(old.toMillis());
  });
});
