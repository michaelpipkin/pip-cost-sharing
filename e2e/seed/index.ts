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
    // Per-batch write counts: the user profiles, one batch per group (the
    // largest is the one to watch against the 400-write limit), then the
    // global mail and app_errors docs.
    const writes = (label: string) =>
      stats.batches.find((b) => b.label === label)?.writes ?? 0;
    const groupWrites = stats.batches
      .filter((b) => b.label.startsWith('group '))
      .map((b) => b.writes);
    console.log(
      `[e2e seed] ${stats.users} users, ${stats.groups} groups, ` +
        `${stats.docsWritten} docs written in ${Date.now() - started} ms ` +
        `(batches: users ${writes('users')}, ${groupWrites.length} groups ` +
        `max ${Math.max(0, ...groupWrites)} / min ${Math.min(...groupWrites)}, ` +
        `mail and app_errors ${writes('mail and app_errors')})`
    );
    if (process.env['E2E_SEED_VERBOSE']) {
      for (const batch of stats.batches) {
        console.log(`[e2e seed]   ${batch.label}: ${batch.writes} writes`);
      }
    }
  } finally {
    // Global setup runs in the Playwright runner process; release the Admin
    // SDK's gRPC channels so they can't hold it open. Workers init their own.
    await closeSeedAdmin();
  }
}
