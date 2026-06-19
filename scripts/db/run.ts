import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exec } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsPath = join(__dirname, 'results.html');

// Remove any results from a previous run so we can detect if this query writes new ones
if (existsSync(resultsPath)) rmSync(resultsPath);

const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm query <query-name>');
  console.error('Example: pnpm query active-groups');
  process.exit(1);
}

const file = name.endsWith('.ts') ? name : `${name}.ts`;
await import(`./queries/${file}`);

// If the query called writeTable(), open the generated file in the default browser
if (existsSync(resultsPath)) {
  let cmd: string;
  if (process.platform === 'win32') {
    cmd = `start "" "${resultsPath}"`;
  } else if (process.platform === 'darwin') {
    cmd = `open "${resultsPath}"`;
  } else {
    cmd = `xdg-open "${resultsPath}"`;
  }
  exec(cmd, (err) => {
    if (err) console.error('Could not open results.html:', err.message);
  });
}
