const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm query <query-name>');
  console.error('Example: pnpm query active-groups');
  process.exit(1);
}
const file = name.endsWith('.ts') ? name : `${name}.ts`;
await import(`./queries/${file}`);
