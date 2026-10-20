import { closeSeedAdmin, getSeedAdmin } from './admin';
import { ALL_DATASETS } from './datasets';
import { validateDatasets } from './validate';
import { writeDatasets } from './write';

/**
 * Validates and writes every dataset into the (already cleared) test
 * emulators, then logs a one-line summary. Called once from global setup.
 */
export async function seedAll(): Promise<void> {
  const started = Date.now();
  validateDatasets(ALL_DATASETS);

  const { db, auth } = getSeedAdmin();
  try {
    const stats = await writeDatasets(db, auth, ALL_DATASETS);
    console.log(
      `[e2e seed] ${stats.users} users, ${stats.groups} groups, ` +
        `${stats.docsWritten} docs written in ${Date.now() - started} ms`
    );
  } finally {
    // Global setup runs in the Playwright runner process; release the Admin
    // SDK's gRPC channels so they can't hold it open. Workers init their own.
    await closeSeedAdmin();
  }
}
