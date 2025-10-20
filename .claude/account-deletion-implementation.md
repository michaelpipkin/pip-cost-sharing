# Account Deletion Implementation

## Overview
Implement a Google Play compliant account deletion feature that allows users to permanently delete their accounts and associated data.

## Requirements

### Frontend - Delete Account Component

**SIMPLIFIED APPROACH - Authentication Required**

**Two UI States:**

1. **Unverified State** (not logged in)
   - Info box: "Authentication Required"
   - Explanation that user must log in to verify identity
   - "Log In to Continue" button (redirects to login with returnUrl)

2. **Verified State** (logged in)
   - Full warning box about irreversible deletion
   - Lists what will happen when account is deleted
   - Email field (read-only, pre-filled from auth)
   - Confirmation checkbox: "I understand this action is irreversible and want to permanently delete my account"
   - "Delete My Account" button (disabled until checkbox checked)

3. **Deletion Completed State**
   - Success message indicating deletion completed
   - User logged out automatically
   - "Return to Home" button

### Backend - Cloud Function (deleteUserAccount)
**SIMPLIFIED - No Email Verification Required**

1. Requires authenticated user (checks `request.auth.uid`)
2. Finds user document in `users` collection by UID
3. Gets user document reference before deletion
4. Finds all documents in all `members` collections where `userRef` matches
5. For each matching member document:
   - Set `email = ''`
   - Set `userRef = null`
6. Deletes user document from `users` collection
7. Deletes Firebase Auth account (last step)
8. Logs errors to console for manual cleanup if partial failure occurs

## Implementation TODOs

### TODO 1: Create Cloud Function ✅
- [ ] Create `deleteUserAccount` function in Firebase Functions
- [ ] Accept oobCode parameter from email link
- [ ] Verify the action code
- [ ] Delete Auth account
- [ ] Query and delete user document
- [ ] Update all members collection documents
- [ ] Implement error logging with analytics

### TODO 2: Implement Delete Account Component ✅
- [ ] Create form with email field (pre-filled if logged in, read-only)
- [ ] Add warning text about irreversible deletion
- [ ] Add confirmation checkbox
- [ ] Implement two flows:
  - Logged in: Call Firebase function to send deletion confirmation email
  - Not logged in: Send email verification first
- [ ] Show success state after initiating deletion
- [ ] Log out user if logged in
- [ ] Add "Return to Home" button

### TODO 3: Extend Account Action Component ✅
- [ ] Add `deleteAccount` to ActionMode type
- [ ] Handle `deleteAccount` mode in ngOnInit
- [ ] Create `processAccountDeletion()` method
- [ ] Call cloud function with oobCode
- [ ] Show appropriate success/error messages
- [ ] Redirect to home after successful deletion

### TODO 4: Testing ✅
- [ ] Test logged-in deletion flow
- [ ] Test not-logged-in deletion flow
- [ ] Verify email removal from members collections
- [ ] Verify auth account deletion
- [ ] Verify user document deletion
- [ ] Test error scenarios and logging

## Technical Notes

### Email Action Link Pattern
Following existing pattern from account-action component:
- Action links: `{origin}/auth/account-action?mode=deleteAccount&oobCode={code}`
- Use Firebase's `sendSignInLinkToEmail` or custom email with action code
- Verification handled in account-action component

### Data Cleanup Strategy
1. Get user document reference BEFORE deletion
2. Use reference to query all groups' members collections
3. Batch update member documents to anonymize data
4. Delete user document last

### Error Handling
- Log all errors to Firebase Analytics
- Provide clear error messages to user
- Partial failures logged for manual cleanup
- Transaction-based operations where possible

## Status
- [x] TODO 1: Cloud Function implementation
- [x] TODO 2: Delete Account Component
- [x] TODO 3: Account Action Component extension
- [ ] TODO 4: Testing

## Implementation Details

### Cloud Function Created (functions/src/index.ts)
**deleteUserAccount**: Simplified deletion function that:
- Requires authenticated user (throws 'unauthenticated' error if not logged in)
- Gets user document directly using `db.collection('users').doc(uid)` (document ID = UID)
- Queries all groups and their members subcollections for matching `userRef`
- Anonymizes all member documents across all groups (sets `email = ''` and `userRef = null`)
- Deletes user document from Firestore (if it exists)
- Deletes Firebase Auth account (done last)
- Logs all steps to console for debugging
- Logs errors for manual cleanup if partial failure

**Key Fix**: User documents are stored with document ID = Firebase Auth UID, not as a field within the document. Query uses `db.collection('users').doc(uid)` instead of `where('id', '==', uid)`.

### Delete Account Component (src/app/components/auth/delete-account/)
**Simplified Two-State Flow:**
- **Unverified state**: Shows login prompt with "Log In to Continue" button (includes returnUrl)
- **Verified state**: Shows warning box, deletion info list, read-only email, confirmation checkbox, and "Delete My Account" button
- **Completed state**: Shows success message, "Return to Home" button, and user is logged out automatically
- Only detects logged-in state (no email verification flow)

## Next Steps
1. Test the authenticated deletion flow
2. Verify data cleanup in Firestore (user doc, member docs)
3. Verify auth account deletion
4. Test error scenarios

## Rationale for Simplified Approach
- **No email integration needed**: Avoids complexity of setting up email service
- **More secure**: User must authenticate before deletion (prevents accidental/malicious deletions)
- **Better UX**: Single, straightforward flow - log in and delete
- **Google Play compliant**: Still provides clear deletion option and irreversible warning
- **Simpler maintenance**: Fewer moving parts, no token management
