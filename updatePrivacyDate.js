import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const privacyPolicyPath = path.join(__dirname, 'src', 'privacy-policy.html');

try {
  // Read the privacy policy file
  let content = fs.readFileSync(privacyPolicyPath, 'utf-8');
  let updated = false;

  // Get the last commit date for the privacy policy file
  const gitCommand = `git log -1 --format=%cd --date=format:"%B %d, %Y" -- "${privacyPolicyPath}"`;
  const lastModified = execSync(gitCommand, { encoding: 'utf-8' }).trim();

  if (lastModified) {
    // Replace the last updated date
    const dateRegex = /<p class="last-updated"><strong>Last Updated:<\/strong> .*?<\/p>/;
    const newDateLine = `<p class="last-updated"><strong>Last Updated:</strong> ${lastModified}</p>`;

    if (dateRegex.test(content)) {
      content = content.replace(dateRegex, newDateLine);
      console.log(`✓ Privacy policy "Last Updated" date set to: ${lastModified}`);
      updated = true;
    }
  } else {
    console.log('ℹ Privacy policy not yet committed, keeping default date');
  }

  // Update copyright year to current year
  const currentYear = new Date().getFullYear();
  const copyrightRegex = /&copy; \d{4} PipSplit\./;
  const newCopyrightLine = `&copy; ${currentYear} PipSplit.`;

  if (copyrightRegex.test(content)) {
    content = content.replace(copyrightRegex, newCopyrightLine);
    console.log(`✓ Copyright year updated to: ${currentYear}`);
    updated = true;
  }

  // Write back to file if any updates were made
  if (updated) {
    fs.writeFileSync(privacyPolicyPath, content, 'utf-8');
  }
} catch (error) {
  console.error('Error updating privacy policy date:', error.message);
  // Don't fail the build if this script has issues
  process.exit(0);
}
