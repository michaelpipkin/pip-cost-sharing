// Google Analytics' terms prohibit sending personally identifiable
// information (email addresses included) in event parameters. Several
// callers put an email in an error string or an `email` parameter because
// it is useful in our own Firestore error log, so every copy that goes to
// Analytics is scrubbed centrally here instead of at each call site.
const EMAIL_PATTERN =
  /[\w.%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function scrubEmails(value: string): string {
  return value.replace(EMAIL_PATTERN, '[email]');
}

// Drops any parameter literally named `email` and replaces email-shaped text
// inside string values; non-string values pass through untouched.
export function scrubAnalyticsParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase() === 'email') continue;
    scrubbed[key] = typeof value === 'string' ? scrubEmails(value) : value;
  }
  return scrubbed;
}
