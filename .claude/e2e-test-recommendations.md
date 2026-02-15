# E2E Test Recommendations

This document outlines recommended additional e2e test scenarios to enhance test coverage for the cost-sharing application.

## High Priority (Core Workflows)

### 1. Expense Editing & Deletion Impact
**Why**: Critical workflow that affects core financial calculations

Test scenarios:
- Create an expense and mark splits as paid
- Edit the expense and verify:
  - Expense is marked as unpaid
  - Summary recalculates correctly (outstanding amounts updated)
  - History remains unchanged (historical records preserved)
- Delete an expense and verify:
  - Summary recalculates correctly
  - History remains unchanged
- Create multiple expenses, pay some, edit/delete unpaid ones
- Create multiple expenses, pay some, edit/delete paid ones

**Files to create/modify**:
- New spec: `e2e/critical-flows/expense-edit-delete.spec.ts`
- May need to add methods to `e2e/pages/expenses.page.ts` for editing/deleting

### 2. Complex Expense Split Scenarios
**Why**: Complex calculations where bugs would be costly

#### Split by Amount
Test the full calculation chain:
- **Member Amount**: Individual member's direct expense portion
- **Evenly Shared Remainder**: (Total - sum of Member Amounts) / number of members
- **Proportional Amount**: Tax/tip distributed proportional to each member's subtotal
- **Rounding adjustments**: 0.01 added/subtracted to make totals match exactly

Test scenario:
```
Total Amount: $100.00
Member A: Member Amount $30.00
Member B: Member Amount $20.00
Member C: Member Amount $0.00
Evenly Shared Remainder: $50.00 (distributed $16.67, $16.67, $16.66)
Proportional Amount (tax): $10.00
Expected splits:
- Member A: $30 + $16.67 = $46.67, tax = $4.67, total = $51.34
- Member B: $20 + $16.67 = $36.67, tax = $3.67, total = $40.34
- Member C: $0 + $16.66 = $16.66, tax = $1.66, total = $18.32
Total: $51.34 + $40.34 + $18.32 = $110.00 ✓
```

#### Split by Percentage
Test scenario:
- Create expense with 3+ members
- Set percentages for all but the last member
- Verify final split auto-calculates to reach 100%
- Verify splits add up to exact total amount

**Files to create/modify**:
- New spec: `e2e/critical-flows/complex-splits.spec.ts`
- May need to add methods to `e2e/pages/expenses.page.ts` for different split types

### 3. Receipt Attachment Workflow
**Why**: Important feature with policy acceptance complexity

Test scenarios:

#### First-time upload (policy not accepted)
- Create expense, click attach button
- Policy dialog appears
- Click "Cancel" - verify upload is cancelled
- Click attach button again
- Click "Accept" - verify upload proceeds
- Verify policy shows as accepted on account page

#### Upload with policy already accepted
- Accept policy on account page first
- Create expense, click attach button
- Verify no policy dialog appears
- Upload PDF receipt (< 5MB)
- Verify receipt is attached
- Upload image receipt (< 5MB)
- Verify receipt is attached

#### File size validation
- Try to upload file > 5MB
- Verify appropriate error message

#### Edit expense with receipt
- Create expense with receipt
- Edit expense
- Verify receipt is preserved
- Upload different receipt
- Verify receipt is replaced

**Files to create/modify**:
- New spec: `e2e/critical-flows/receipt-attachment.spec.ts`
- May need to add methods to `e2e/pages/expenses.page.ts` for receipt upload
- May need to add methods to `e2e/pages/account.page.ts` for policy acceptance

## Medium Priority (Important Features)

### 4. Group Admin Management
**Why**: Important security/permission feature

Test scenarios:
- Create group as admin
- Add second member
- Make second member an admin
- Verify both members have admin rights (can add members, delete group, etc.)
- Remove admin rights from second member
- Verify they no longer have admin rights
- Try to remove own admin rights as current user (should fail)
- As only admin, try to leave group (should be blocked with message)
- Make another member admin
- Successfully leave group
- Verify group still exists with remaining admin

**Files to create/modify**:
- New spec: `e2e/groups/group-admin-management.spec.ts`
- May need to add methods to `e2e/pages/groups.page.ts` for admin management
- May need new page object: `e2e/pages/members.page.ts`

### 5. Account Management
**Why**: Core user management features

Test scenarios:

#### Email change
- Navigate to account page
- Change email address
- Verify email is updated
- Logout and login with new email

#### Password change
- Navigate to account page
- Change password
- Verify success message
- Logout and login with new password

#### Payment handles
- Navigate to account page
- Add Venmo handle
- Add Cash App handle
- Add Zelle handle
- Create a payment scenario
- Verify handles display in payment confirmation dialog

#### Receipt retention policy
- Navigate to account page
- Accept policy from account page
- Verify policy shows as accepted
- Try to upload receipt - should work without dialog

#### Account deletion
- Create group with 2 admins
- Delete account as one admin
- Verify other admin retains admin rights
- Create group with 1 admin and 1 regular member
- Delete admin account
- Verify regular member is promoted to admin

**Files to create/modify**:
- New spec: `e2e/account/account-management.spec.ts`
- New page object: `e2e/pages/account.page.ts`

## Lower Priority (Nice to Have)

### 6. Group-Specific Display Name
**Why**: User experience feature

Test scenarios:
- Create/join group
- Navigate to Members page
- Click on own name in members table
- Change display name
- Verify name appears in expenses, summary, history

**Files to create/modify**:
- New spec: `e2e/groups/display-name.spec.ts`
- May need to add methods to `e2e/pages/members.page.ts`

### 7. Edge Cases & Validation
**Why**: Robustness and error handling

Test scenarios:
- Upload receipt > 5MB (verify error message)
- Create many expenses (20+) and verify pagination/performance
- Create expense with all members having $0 splits (error case?)
- Create expense with total not matching sum of splits (should be prevented by UI)
- Multiple concurrent expenses with different split types

**Files to create/modify**:
- New spec: `e2e/edge-cases/validation.spec.ts`

## Implementation Notes

### Test Data Strategy
- Continue using unique users per test run (timestamp-based emails)
- Use `test.describe.serial()` for workflows that require sequential steps
- Clear emulator data at start via global setup (already implemented)

### Page Objects to Create
- `e2e/pages/account.page.ts` - Account management page
- `e2e/pages/members.page.ts` - Group members management page

### Page Objects to Extend
- `e2e/pages/expenses.page.ts` - Add methods for:
  - Editing expenses
  - Deleting expenses
  - Complex split configurations (amount vs percentage)
  - Receipt attachment
- `e2e/pages/groups.page.ts` - Add methods for:
  - Admin management (make/remove admin)
  - Leaving groups

## Priority for Implementation
1. **Start with #1 or #2** - Core financial workflows
2. **Then #3** - Receipt workflow is important and complex
3. **Then #4 and #5** - Important user/group management features
4. **Finally #6 and #7** - Nice to have features and edge cases
