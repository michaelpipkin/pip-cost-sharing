import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const indexesFile = 'firestore.indexes.json';

try {
  const output = execSync('firebase firestore:indexes', { encoding: 'utf8' });

  if (!output?.trim()) {
    throw new Error('firebase firestore:indexes returned no output');
  }

  const deployedIndexes = JSON.parse(output);

  const currentIndexes = JSON.parse(readFileSync(indexesFile, 'utf8'));

  const currentIndexCount = currentIndexes.indexes?.length ?? 0;
  const currentOverrideCount = currentIndexes.fieldOverrides?.length ?? 0;
  const deployedIndexCount = deployedIndexes.indexes?.length ?? 0;
  const deployedOverrideCount = deployedIndexes.fieldOverrides?.length ?? 0;

  writeFileSync(
    indexesFile,
    `${JSON.stringify(deployedIndexes, null, 2)}\n`
  );

  console.log(
    `indexes: ${currentIndexCount} -> ${deployedIndexCount}, fieldOverrides: ${currentOverrideCount} -> ${deployedOverrideCount}`
  );
  console.log(`${indexesFile} updated to match deployed Firestore indexes.`);
} catch (error) {
  console.error('Error occurred:', error);
  throw error;
}
