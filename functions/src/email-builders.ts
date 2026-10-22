import type { DocumentData } from 'firebase-admin/firestore';

// Pure email-content helpers shared by index.ts and group-emails.ts. They
// live in their own module (re-exported from index.ts) because
// group-emails.ts is itself re-exported from index.ts, so importing them from
// index.ts there would be circular.

/** One plausible address (sendGroupInvite's check on an invitee's email). */
export const INVITE_EMAIL_PATTERN = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;

/**
 * Whether a stored member `email` is exactly one plausible address, safe to
 * use as a mail doc's `to`: nodemailer also accepts arrays and comma- or
 * semicolon-separated lists, which INVITE_EMAIL_PATTERN alone lets through
 * after the domain (e.g. `a@x.com,b`).
 */
export function isSingleEmailAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !/[,;]/.test(value) &&
    INVITE_EMAIL_PATTERN.test(value)
  );
}

/**
 * Format a monetary amount using the group's currency settings.
 * Falls back to symbol + toFixed for non-ISO codes (OTH, OT2).
 */
export function formatAmount(
  amount: number,
  currencyCode: string,
  currencySymbol: string,
  decimalPlaces: number
): string {
  if (currencyCode === 'OTH' || currencyCode === 'OT2') {
    const plain = amount.toFixed(decimalPlaces);
    return currencySymbol ? `${currencySymbol}${plain}` : plain;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(amount);
  } catch {
    const plain = amount.toFixed(decimalPlaces);
    return currencySymbol ? `${currencySymbol}${plain}` : plain;
  }
}

/**
 * Escape HTML special characters in a string for safe embedding in HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Wrap email body content in the standard PipSplit HTML email shell.
 * `footerText` defaults to the member opt-out notice; pass a different
 * value for emails that aren't sent to group members (e.g. admin alerts).
 */
export function buildEmailHtml(
  content: string,
  footerText: string = 'You received this email because you are a member of a PipSplit group.<br>To opt out, update your notification preferences in PipSplit.'
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f7fbf0;font-family:Arial,sans-serif;color:#191d17;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="background-color:#105208;padding:20px 32px;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">PipSplit</h1></td></tr><tr><td style="background-color:#ffffff;padding:32px;">${content}</td></tr><tr><td style="background-color:#eff2e8;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center;"><p style="margin:0;font-size:12px;color:#5b6058;">${footerText}</p></td></tr></table></td></tr></table></body></html>`;
}

/**
 * Convert a plain-text payment methods string to HTML paragraphs.
 */
export function buildPaymentMethodsHtml(methods: string): string {
  if (methods === '(No payment methods on file)') {
    return `<p style="color:#5b6058;margin:0;font-style:italic;">(No payment methods on file)</p>`;
  }
  return methods
    .split('\n')
    .map((line) => `<p style="margin:2px 0;">${escapeHtml(line)}</p>`)
    .join('');
}

/**
 * Build a newline-separated list of payment method lines for a user.
 * Returns a fallback string if no payment methods are configured.
 */
export function buildPaymentMethodLines(
  userData: DocumentData
): string {
  const methods: string[] = [];
  if (userData['venmoId'])
    methods.push(
      `Venmo: @${(userData['venmoId'] as string).replace(/^@/, '')}`
    );
  if (userData['paypalId']) methods.push(`PayPal: ${userData['paypalId']}`);
  if (userData['cashAppId'])
    methods.push(`Cash App: $${userData['cashAppId']}`);
  if (userData['zelleId']) methods.push(`Zelle: ${userData['zelleId']}`);
  return methods.length > 0
    ? methods.join('\n')
    : '(No payment methods on file)';
}
