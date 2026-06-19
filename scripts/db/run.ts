import { existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { exec } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const queriesDir = join(__dirname, 'queries');
const resultsPath = join(__dirname, 'results.html');

// Remove any results from a previous run so we can detect if this query writes new ones
if (existsSync(resultsPath)) rmSync(resultsPath);

const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm query <query-name>');
  console.error('Example: pnpm query active-groups');
  process.exit(1);
}

// Strip extension for validation, then re-add it for the path
const baseName = name.endsWith('.ts') ? name.slice(0, -3) : name;

// Only allow safe filenames — no path separators, dots, or special characters
if (!/^[\w-]+$/.test(baseName)) {
  console.error(`Invalid query name: "${name}". Use only letters, digits, hyphens, and underscores.`);
  process.exit(1);
}

const resolvedPath = resolve(queriesDir, `${baseName}.ts`);

// Defense in depth: confirm the resolved path stays inside queries/
if (!resolvedPath.startsWith(queriesDir + sep)) {
  console.error(`Query "${name}" resolves outside the queries/ directory.`);
  process.exit(1);
}

if (!existsSync(resolvedPath)) {
  const available = readdirSync(queriesDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -3))
    .join(', ');
  console.error(`Query "${baseName}" not found. Available: ${available || '(none)'}`);
  process.exit(1);
}

await import(pathToFileURL(resolvedPath).href);

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
