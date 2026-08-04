// Template for github.config.ts, which is gitignored. Copy this file to
// github.config.ts and fill in a real GitHub Personal Access Token.
//
// Used client-side by HelpService (src/app/services/help.service.ts) to
// create issues directly against the GitHub API when a user submits
// feedback through the app's Help feature - note this token ships in the
// compiled browser bundle, so scope it minimally: a fine-grained PAT with
// "Issues: write" access to michaelpipkin/pip-cost-sharing only.
// https://github.com/settings/personal-access-tokens

export const githubConfig = {
  personalAccessToken: '',
};
