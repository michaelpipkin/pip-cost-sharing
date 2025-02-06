import { replaceInFileSync } from 'replace-in-file';

const buildDate = new Date();

const options = {
  files: [
    'src/environments/environment.ts',
    'src/environments/environment.prod.ts',
  ],
  from: /buildDate: (.*)/g,
  to: `buildDate: new Date('${buildDate.toISOString()}')`,
  allowEmptyPaths: false,
};

try {
  const changedFiles = replaceInFileSync(options);
  if (changedFiles.length === 0) {
    throw `Please make sure that the file(s) ${options.files.join(', ')} have buildDate`;
  }

  console.log(`Build date is set to ${buildDate.toDateString()}`);
} catch (error) {
  console.error('Error occurred:', error);
  throw error;
}
