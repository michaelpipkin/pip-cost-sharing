import { expect, test } from '@playwright/test';
// This file has been split into:
// - auth-unauthenticated.spec.ts: Tests for unauthenticated users (login/register forms, validation)
// - auth-authenticated.spec.ts: Tests for authenticated users (logout, guard redirects, etc.)
//
// This separation ensures better test isolation and prevents authentication state conflicts.

test.describe('Authentication - Setup Verification', () => {
  test('should verify Firebase emulator connectivity', async ({ page }) => {
    // Basic connectivity test to ensure emulators are running
    // before running the more specific auth tests

    // Test Firestore emulator
    const firestoreResponse = await page.request.get('http://127.0.0.1:8080');
    expect(firestoreResponse.ok()).toBeTruthy();

    // Test Auth emulator
    const authResponse = await page.request.get('http://127.0.0.1:9099');
    expect(authResponse.ok()).toBeTruthy();
  });
});
