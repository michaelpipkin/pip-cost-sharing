# PipSplit Application Functionality Guide

**Purpose**: This document provides a comprehensive description of the PipSplit application's functionality to guide end-to-end (e2e) testing. It describes what each page does, how users interact with it, and what behavior should be tested.

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Navigation & User States](#navigation--user-states)
3. [Authentication & Account Management](#authentication--account-management)
4. [Administration Pages](#administration-pages)
5. [Core Features](#core-features)
6. [Analysis & Reporting](#analysis--reporting)
7. [Utility Pages](#utility-pages)
8. [Data Flows](#data-flows)

---

## Application Overview

**PipSplit** is a cost-sharing application that allows users to:
- Track shared expenses among group members
- Split costs fairly using various allocation methods
- View summaries of who owes whom
- Manage multiple groups with different members and categories
- Create memorized (recurring) expenses for common transactions

**Technology Stack**:
- Angular (with signals API)
- Firebase (Authentication & Firestore)
- Material Design components
- Progressive Web App (PWA) capabilities

**Key Concepts**:
- **Groups**: Collections of people who share expenses
- **Members**: Individuals within a group who participate in expenses
- **Categories**: Classification for expenses (e.g., "Groceries", "Utilities")
- **Expenses**: Individual transactions that are split among members
- **Memorized Expenses**: Templates for recurring expenses
- **Document References**: The app uses Firestore document references rather than IDs

---

## Navigation & User States

### User States

The application has three distinct user states that affect navigation:

1. **Not Logged In**
   - Can view: Home, Help, About, Split (limited), Login, Register
   - Cannot access: Groups, Members, Categories, Expenses, Memorized, Summary, History, Account

2. **Logged In (No Group Selected)**
   - Can view: Home, Help, About, Groups, Account
   - Cannot access: Members, Categories, Expenses, Memorized, Summary, History
   - Must select a group to unlock full functionality

3. **Logged In (Group Selected)**
   - Full access to all features
   - Navigation shows all main sections

4. **Demo Mode**
   - Special state for exploring the app without authentication
   - Has its own set of demo routes with pre-populated data
   - All navigation items prefixed with "demo"

### Navigation Structure

#### Desktop Navigation (>1100px width)
- **Top Toolbar**: Shows all navigation links horizontally
- **Left Section**: App title "PipSplit"
- **Center Section**: Main navigation links (Groups, Members, Categories, Expenses, Memorized, Summary, History, Split)
- **Right Section**: Theme toggle, Help, Account/Login, Logout

#### Mobile Navigation (≤1100px width)
- **Top Toolbar**: Hamburger menu, app title, Split button, theme toggle, help, account/login
- **Hamburger Menu**: Contains main navigation links in a vertical menu

#### Navigation Visibility Rules
- Groups link: Always visible when logged in
- Members, Categories links: Visible only when a group is selected
- Expenses, Memorized, Summary, History links: Visible only when a group is selected
- Split link: Always visible (even when not logged in)
- Account link: Visible only when logged in (not in demo mode)
- Login link: Visible only when not logged in
- Logout button: Visible only when logged in

---

## Authentication & Account Management

### Login Page (`/auth/login`)
**Route**: `/auth/login`
**Guard**: `loggedInGuard` (redirects if already logged in)

**Functionality**:
- Email and password input fields
- "Remember me" checkbox for persistent login
- Login button
- Links to:
  - Register page
  - Forgot password page
- Google Sign-In button (OAuth)

**Testable Behaviors**:
- [ ] Form validation (email format, required fields)
- [ ] Successful login redirects to home or previous page
- [ ] Failed login shows error message
- [ ] "Remember me" persists session across browser restarts
- [ ] Google Sign-In flow works correctly
- [ ] Already logged-in users are redirected away

### Register Page (`/auth/register`)
**Route**: `/auth/register`
**Guard**: `loggedInGuard` (redirects if already logged in)

**Functionality**:
- Email input
- Password input
- Confirm password input
- Display name input
- Register button
- Link to login page

**Testable Behaviors**:
- [ ] Form validation (email format, password strength, passwords match)
- [ ] Successful registration creates account and logs user in
- [ ] Failed registration shows appropriate error messages
- [ ] Duplicate email shows error
- [ ] Already logged-in users are redirected away

### Forgot Password Page (`/auth/forgot-password`)
**Route**: `/auth/forgot-password`
**Guard**: `loggedInGuard` (redirects if already logged in)

**Functionality**:
- Email input field
- Send reset link button
- Link back to login page

**Testable Behaviors**:
- [ ] Form validation (email format required)
- [ ] Successful submission shows confirmation message
- [ ] Email is sent to user (may need to check Firebase or email)
- [ ] Invalid email shows appropriate error

### Reset Password Page (`/auth/reset-password`)
**Route**: `/auth/reset-password`
**Guard**: `loggedInGuard` (redirects if already logged in)

**Functionality**:
- Accessed via link from password reset email
- New password input
- Confirm password input
- Reset button

**Testable Behaviors**:
- [ ] Form validation (password strength, passwords match)
- [ ] Successful reset allows login with new password
- [ ] Invalid or expired token shows error
- [ ] User is redirected to login after successful reset

### Account Page (`/auth/account`)
**Route**: `/auth/account`
**Guard**: `basicAuthGuard` (requires authentication)

**Functionality**:
- Display user information (email, display name)
- Change display name
- Change email
- Change password
- Delete account option
- Email verification status
- Send verification email button

**Testable Behaviors**:
- [ ] Display name can be updated
- [ ] Email can be updated (may require re-authentication)
- [ ] Password can be changed
- [ ] Delete account flow works (with confirmation)
- [ ] Email verification email can be sent
- [ ] Unverified email shows appropriate warning

### Account Action Page (`/auth/account-action`)
**Route**: `/auth/account-action`
**No guard**

**Functionality**:
- Handles Firebase auth action links (verify email, reset password)
- Processes query parameters from email links
- Shows success/error messages
- Redirects to appropriate page after action

**Testable Behaviors**:
- [ ] Email verification link verifies email
- [ ] Password reset link redirects to reset password page
- [ ] Invalid/expired links show error messages

---

## Administration Pages

### Groups Page (`/administration/groups`)
**Route**: `/administration/groups`
**Guard**: `authGuard`

**Functionality**:
- List all groups user belongs to
- Show current selected group (highlighted)
- Add new group button
- Edit group button (for each group)
- Delete group button (for each group)
- Select/switch group button
- Group card shows:
  - Group name
  - Number of members
  - Created date (or other metadata)

**Business Rules**:

**Add Group (`addGroup`):**
- ✅ **Batch creation**: Creates group, first member, and default category in single transaction
  - Group document with provided details
  - Creator added as first member with `groupAdmin: true`
  - "Default" category created with `active: true`
- Transaction ensures all-or-nothing creation

**Update Group (`updateGroup`):**
- ✅ **Deactivation logic**: When setting `active: false` or `archived: true`:
  - Clears group as `defaultGroupRef` for all users who had it set
  - If current group is being deactivated, clears it from current session
  - Removes from localStorage
  - User must select another group to continue working

**Delete Group (`deleteGroup`):**
- ✅ **Cloud function deletion**: Uses Firebase Cloud Function for complete cascade delete
  - Deletes group document
  - Deletes all subcollections (members, categories, expenses, splits, memorized, history)
  - Ensures data integrity
- ✅ **Current group handling**: If deleting current group:
  - Clears from current session
  - Clears user's `defaultGroupRef`
  - Removes from localStorage
- ✅ **Permission check**: Likely requires admin rights (enforced by cloud function)

**Select/Switch Group:**
- Sets as current group in application state
- Saves to localStorage for persistence
- Sets as user's `defaultGroupRef` in database
- Loads all group data (categories, members, expenses, splits, memorized, history)

**Testable Behaviors**:
- [ ] All user's groups are displayed
- [ ] Current group is visually indicated
- [ ] Add group dialog opens
- [ ] Add group creates group, first member (admin), and Default category
- [ ] Creator is automatically set as group admin
- [ ] Default category is created and active
- [ ] New group creation is atomic (all or nothing)
- [ ] Edit group dialog opens and updates group
- [ ] Deactivating group clears it as default for all users
- [ ] Deactivating current group clears session and localStorage
- [ ] User redirected to groups page when current group deactivated
- [ ] Delete group removes group (with confirmation)
- [ ] Delete group removes all subcollections (members, categories, etc.)
- [ ] Deleting current group clears session and defaultGroupRef
- [ ] Delete requires confirmation
- [ ] Only admins can delete groups
- [ ] Switching groups updates the current group
- [ ] Switch saves to localStorage
- [ ] Switch sets as user's defaultGroupRef
- [ ] Switch loads all group data (categories, members, etc.)
- [ ] Group selection persists across page refreshes
- [ ] Deleting current group selects another group or null

### Members Page (`/administration/members`)
**Route**: `/administration/members`
**Guards**: `authGuard`, `groupGuard` (requires group selection)

**Functionality**:
- List all members in current group
- Add member button
- Edit member button (for each member)
- Delete member button (for each member)
- Member card/row shows:
  - Member name
  - Active/Inactive status

**Important Notes**:
- Members are stored as a subcollection under Groups
- Members do NOT have special features like default split percentages
- Payment service handles (PayPal, Venmo, Zelle, CashApp) are stored at the **User** level, not Member level
  - This makes sense since a user can be a member of multiple groups
  - Handles are pulled from the Users collection when displaying payment options

**Business Rules**:

**Add Member (`addMemberToGroup`):**
- ✅ **Duplicate email check**: Cannot add member if one with the same email already exists in the group
  - Error: "A member with this email address already exists in the group."
- ✅ **Auto user linking**: If a User account exists with the member's email, automatically links member to that user
  - This allows the member to see the group when they log in
  - Links `userRef` on member document to user document

**Update Member (`updateMember`, `updateMemberWithUserMatching`):**
- ✅ **Duplicate email check**: Cannot update email if another member with that email already exists in the group
  - Excludes current member from duplicate check
  - Error: "A member with this email address already exists in the group."
- ✅ **Auto user linking on email change**: When email is updated and member isn't already linked:
  - Searches for User account with new email
  - Automatically links if found

**Delete Member (`removeMemberFromGroup`):**
- ✅ **Dependency check**: Cannot delete if member has any splits (as payer OR owed by)
  - Error: "This member has existing splits and cannot be deleted."
  - **Solution**: Make member inactive instead
- Member is fully deleted if no splits exist

**Leave Group (`leaveGroup`):**
- ✅ **Admin requirement**: If leaving member is the only group admin, cannot leave
  - Error: "You are the only group admin. Please assign another member as admin before leaving the group."
  - Must promote another member to admin first
- ✅ **Smart delete logic**:
  - If member has splits: Sets `active = false` (preserves data)
  - If member has no splits: Fully deletes member document
- Clears user's `defaultGroupRef`

**Testable Behaviors**:
- [ ] All members of current group are displayed
- [ ] Add member dialog creates new member
- [ ] Cannot add member with duplicate email in same group
- [ ] Error shown when attempting to add duplicate email
- [ ] Adding member with existing user email auto-links to user
- [ ] Edit member dialog updates member information
- [ ] Cannot update member email to duplicate email in same group
- [ ] Error shown when attempting to update to duplicate email
- [ ] Can update member email to unique email successfully
- [ ] Updating email to existing user auto-links if not already linked
- [ ] Delete member removes member (with confirmation)
- [ ] Cannot delete member if they have splits (as payer or owed by)
- [ ] Error shown when attempting to delete member with splits
- [ ] Can delete member with no splits successfully
- [ ] Leave group fails if user is only admin
- [ ] Error shown when only admin tries to leave
- [ ] Leave group with splits makes member inactive
- [ ] Leave group without splits deletes member
- [ ] Leave group clears user's defaultGroupRef
- [ ] Active/inactive status can be toggled
- [ ] Inactive members don't appear in expense form dropdowns
- [ ] Inactive members appear in summary if they have unpaid splits
- [ ] Member list updates when group changes

### Categories Page (`/administration/categories`)
**Route**: `/administration/categories`
**Guards**: `authGuard`, `groupGuard` (requires group selection)

**Functionality**:
- List all categories in current group
- Add category button
- Edit category button (for each category)
- Delete category button (for each category)
- Category card/row shows:
  - Category name
  - Active/Inactive status

**Important Notes**:
- Categories do NOT have special attributes like icons or colors
- Only have name and active/inactive status
- **Default Category Behavior**:
  - When a new group is created, a "Default" category is automatically added
  - If a group only has one category, it indicates the group doesn't care about tracking categories
  - **Smart Dropdown Logic**: Category dropdown is **hidden** on expense/memorized forms when:
    - Group has only one active category
    - Expense is automatically assigned to that single category
  - Category dropdown is **visible** when:
    - Group has more than one active category
    - User needs to select which category applies

**Business Rules**:

**Add Category (`addCategory`):**
- ✅ **Duplicate name check**: Cannot add category if one with the same name already exists in the group
  - Error: "This category already exists."
  - Check is case-sensitive

**Update Category (`updateCategory`):**
- ✅ **Duplicate name check**: Cannot rename category if another category with that name already exists
  - Excludes current category from duplicate check
  - Error: "This category already exists."

**Delete Category (`deleteCategory`):**
- ✅ **Dependency check**: Cannot delete if category is assigned to any expenses
  - Error: "This category is assigned to expenses and cannot be deleted."
  - **Solution**: Make category inactive instead of deleting
- Category is fully deleted if no expenses use it

**Auto-creation:**
- ✅ **Default category**: When new group is created, "Default" category is automatically added
  - Created with `active: true`
  - Part of group creation batch write

**Testable Behaviors**:
- [ ] All categories of current group are displayed
- [ ] New groups automatically have "Default" category created
- [ ] Default category is created as active
- [ ] Add category dialog creates new category
- [ ] Cannot add category with duplicate name in same group
- [ ] Error shown when attempting to add duplicate name
- [ ] Category names are case-sensitive for duplicates
- [ ] Edit category dialog updates category
- [ ] Cannot rename category to existing category name
- [ ] Error shown when attempting to rename to duplicate
- [ ] Can rename category to unique name successfully
- [ ] Delete category removes category (with confirmation)
- [ ] Cannot delete category if it has expenses assigned
- [ ] Error shown when attempting to delete category with expenses
- [ ] Can delete category with no expenses successfully
- [ ] Active/inactive status can be toggled
- [ ] Making category inactive removes it from dropdowns
- [ ] Making category active adds it back to dropdowns
- [ ] Category list updates when group changes
- [ ] Category dropdown hidden on expense forms when only 1 active category
- [ ] Category dropdown visible on expense forms when 2+ active categories
- [ ] Category dropdown shows only active categories
- [ ] Expenses with only 1 active category auto-assign to that category

---

## Core Features

### Expenses Page (`/expenses`)
**Route**: `/expenses`
**Guards**: `authGuard`, `groupGuard`

**Functionality**:
- List all expenses for current group
- Filter by date range, category, member
- Sort by date, amount, description
- Search by description
- Add expense button
- Edit expense button (for each expense)
- Delete expense button (for each expense)
- Clone expense button (create from existing)

**Expense Table Columns**:
  - **Date**: Expense date
  - **Payer**: Member who paid the expense
  - **Description**: Expense description
  - **Category**: Expense category
  - **Amount**: Total expense amount
  - **Rcpt**: Receipt indicator (shows if receipt attached)
  - **Paid**: Shows "No" if any splits are unpaid, or indicator of payment status
  - **Expand Arrow**: Down arrow button to expand split details

**Expandable Split Details**:
- Click down arrow in last column to expand expense
- Shows breakdown of how expense is split among members
- Detail table columns:
  - **Owed By**: Member name
  - **Amount**: How much this member owes
  - **Paid**: Payment status for this split
  - **Mark Paid/Unpaid**: Button to toggle split payment status

**Individual Split Payment Management**:
- Each split (except the payer's) has a Mark Paid/Unpaid button
- Payer's row shows "N/A" (they paid the expense, so don't owe anything)
- **Green button** (with $ icon): Split is unpaid
  - Click to mark this single split as paid
- **Red button**: Split is paid
  - Click to mark this single split as unpaid
- This marks only ONE split at a time (not all splits between two members)
- Does NOT create a history record (unlike Summary page Pay button)

**Business Rules**:

**Delete Expense (`deleteExpense`):**
- ✅ **Cascade delete**: Deletes expense and all associated splits in batch
- ✅ **Receipt cleanup**: Deletes receipt from Firebase Storage if one exists
  - Receipt path stored in expense document
  - Deletion happens after batch commit
  - Failures logged but don't block expense deletion
- Batch ensures all-or-nothing deletion

**Testable Behaviors**:

**List and Filtering**:
- [ ] All expenses for current group are displayed
- [ ] Table shows all columns: Date, Payer, Description, Category, Amount, Rcpt, Paid, Expand
- [ ] Filtering by date range works correctly
- [ ] Filtering by category works correctly
- [ ] Filtering by member works correctly
- [ ] Search by description works correctly
- [ ] Sorting works correctly
- [ ] Multiple filters can be combined
- [ ] Pagination works if many expenses
- [ ] Expense list updates when group changes

**Actions**:
- [ ] Add expense button navigates to add page
- [ ] Edit expense button navigates to edit page with expense ID
- [ ] Delete expense removes expense (with confirmation)
- [ ] Delete expense removes all associated splits
- [ ] Delete expense removes receipt from storage
- [ ] Expense deletion is atomic (all or nothing)
- [ ] Clone expense button pre-fills add form with expense data

**Expandable Split Details**:
- [ ] Down arrow button expands expense to show splits
- [ ] Clicking expand again collapses the details
- [ ] Expanded detail shows all splits for the expense
- [ ] Detail table shows: Owed By, Amount, Paid, Mark Paid/Unpaid
- [ ] Payer's split shows "N/A" for Paid status
- [ ] Payer's split does not have Mark Paid/Unpaid button
- [ ] Other members show their owed amount
- [ ] Split amounts sum to total expense amount
- [ ] Paid status correctly reflects split payment state

**Individual Split Payment**:
- [ ] Mark Paid/Unpaid button appears for each non-payer split
- [ ] Button is green when split is unpaid
- [ ] Button is red when split is paid
- [ ] Clicking green button marks split as paid
- [ ] Clicking red button marks split as unpaid
- [ ] Marking split as paid updates button to red
- [ ] Marking split as unpaid updates button to green
- [ ] Paid column in expense row updates when all splits paid
- [ ] Individual split payment does NOT create history record
- [ ] Only affects single split (not all splits between members)

### Add Expense Page (`/expenses/add`)
**Route**: `/expenses/add`
**Guards**: `authGuard`, `groupGuard`, `noCrawlerGuard`

**Functionality**:
- Date picker (defaults to today)
- Description input
- Amount input (Total Amount)
- Category selector
- Paid by member selector
- Split method toggle button (switches between "By Amount" and "By Percentage")
- Member allocation interface (varies by split method - see below)
- Save button
- Cancel button
- Option to create from memorized expense

**Business Rules**:

**Add Expense (`addExpense`):**
- ✅ **Batch write**: Creates expense and all splits in single transaction
  - Ensures all-or-nothing creation
  - If any part fails, entire transaction rolls back
- ✅ **Receipt handling**: If receipt provided:
  - Uploads to Firebase Storage first
  - Stores path in expense document
  - If batch commit fails, uploaded receipt is deleted (cleanup)
- ✅ **Split creation**: Creates one split document per member allocation
  - Each split references the expense
  - Splits contain member refs, amounts, paid status, etc.

**Update Expense (`updateExpense`):**
- ✅ **Batch write**: Updates expense, deletes old splits, creates new splits
  - All changes are atomic
- ✅ **Split replacement**: Deletes ALL old splits and creates ALL new splits
  - Cannot partially update splits - full replacement
  - Ensures data consistency
- ✅ **Receipt handling**: If new receipt provided:
  - Uploads to Firebase Storage (overwrites if exists)
  - Updates path in expense document
  - If batch commit fails, deletes uploaded receipt (cleanup)

#### Split Allocation Logic

The app supports two split methods with a toggle button to switch between them:

**1. By Percentage**
- Simpler interface for percentage-based splits
- Each member has a percentage field
- Proportional Amount and Evenly Shared Remainder fields are **hidden** (not applicable)
- The last member's percentage field is **read-only** and automatically calculated to make the total equal 100%
- User enters percentages for all members except the last one
- Allocated amounts are calculated by applying percentages to Total Amount

**2. By Amount** (more complex, handles mixed individual/shared expenses)
- Default behavior: Total Amount is split evenly among all members
- Three allocation components work together:

  **Member Amount** (per member):
  - Direct individual responsibility for specific items
  - Example: "Alice bought herself a $20 item in addition to shared groceries"
  - User enters this amount for any member with individual expenses

  **Proportional Amount** (single field for entire expense):
  - Amount to be allocated proportionally based on each member's subtotal
  - Distributed based on: (Member Amount + share of Evenly Shared Remainder)
  - Used when some portion should be split by proportion rather than evenly

  **Evenly Shared Remainder** (calculated, read-only):
  - Automatically calculated: Total Amount - Σ(Member Amounts) - Proportional Amount
  - This remainder is distributed evenly among all members
  - Shows how much is left to split equally after individual and proportional amounts

**Calculation Flow for "By Amount"**:
1. User enters Total Amount
2. User enters Member Amounts for any members with individual expenses (optional)
3. User enters Proportional Amount if needed (optional)
4. App calculates: **Evenly Shared Remainder** = Total - Σ(Member Amounts) - Proportional Amount
5. Evenly Shared Remainder is distributed equally: each member gets (Evenly Shared Remainder ÷ number of members)
6. For each member, **Subtotal** = Member Amount + their share of Evenly Shared Remainder
7. Proportional Amount is allocated based on each member's Subtotal:
   - Member's Proportional Share = (Member's Subtotal ÷ Σ(all Subtotals)) × Proportional Amount
8. **Allocated Amount** (per member) = Member Amount + share of Evenly Shared Remainder + Proportional Share
9. **Rounding adjustment**: If Σ(Allocated Amounts) ≠ Total Amount (due to rounding):
   - Go through members one at a time
   - Add or subtract 0.01 (or 1 for non-decimal currencies) per member
   - Continue until Σ(Allocated Amounts) = Total Amount exactly

**Use Cases for "By Amount"**:
- Pure even split: Leave all fields empty → even distribution
- Individual expenses: Enter Member Amounts → each pays their own + even share of remainder
- Mixed scenario: Member Amounts + Proportional Amount → complex splits with both individual and weighted sharing

**Testable Behaviors**:
- [ ] Form validation (required fields, valid amounts)
- [ ] Date picker works correctly
- [ ] Total Amount input accepts decimal values
- [ ] Category dropdown shows active categories
- [ ] Paid by dropdown shows active members
- [ ] Inactive members are not shown in dropdowns
- [ ] Split method toggle button switches between "By Amount" and "By Percentage"
- [ ] Toggle changes the allocation interface appropriately

**By Percentage Split**:
- [ ] Each member has a percentage input field
- [ ] Last member's percentage is read-only
- [ ] Last member's percentage auto-calculates to make total = 100%
- [ ] Proportional Amount field is hidden
- [ ] Evenly Shared Remainder field is hidden
- [ ] Allocated amounts are calculated correctly from percentages
- [ ] Validation prevents percentages that don't total 100% (except last which is auto-calculated)

**By Amount Split**:
- [ ] Default even split when no fields are filled
- [ ] Member Amount fields accept decimal values
- [ ] Proportional Amount field accepts decimal values
- [ ] Evenly Shared Remainder is calculated correctly: Total - Σ(Member Amounts) - Proportional
- [ ] Evenly Shared Remainder is distributed equally among members
- [ ] Proportional Amount is allocated based on subtotals correctly
- [ ] Allocated Amounts sum to Total Amount exactly
- [ ] Rounding adjustments work correctly (0.01 or 1 increments)
- [ ] Pure even split works (all fields empty)
- [ ] Individual expenses work (Member Amounts only)
- [ ] Mixed scenarios work (Member Amounts + Proportional Amount)
- [ ] Complex calculations produce correct allocations

**General**:
- [ ] Save creates expense and redirects to expenses list
- [ ] Cancel discards changes and returns to expenses list
- [ ] Loading from memorized pre-fills form correctly
- [ ] Form shows validation errors for invalid data

### Edit Expense Page (`/expenses/:id`)
**Route**: `/expenses/:id`
**Guards**: `authGuard`, `groupGuard`, `noCrawlerGuard`
**Resolver**: `editExpenseResolver`

**Functionality**:
- Same form as Add Expense, but pre-filled with existing data
- All split allocation logic applies (see Add Expense section)
- Update button instead of Save
- Delete button

**Testable Behaviors**:
- [ ] Expense data loads correctly into all form fields
- [ ] Split method loads correctly (By Amount or By Percentage)
- [ ] Member allocations load correctly based on split method
- [ ] All fields are editable
- [ ] Split method can be changed (toggles between By Amount/By Percentage)
- [ ] All split allocation logic works same as Add Expense
- [ ] Update saves changes correctly
- [ ] Delete removes expense (with confirmation)
- [ ] Validation works same as Add Expense
- [ ] Non-existent expense ID shows error or redirects

### Memorized Expenses Page (`/memorized`)
**Route**: `/memorized`
**Guards**: `authGuard`, `groupGuard`

**Functionality**:
- List all memorized expenses for current group
- Add memorized expense button
- Edit memorized expense button (for each)
- Delete memorized expense button (for each)
- Use/Create expense from memorized button
- Memorized expense card/row shows:
  - Description
  - Default amount
  - Category
  - Default split method
  - Last used date

**Testable Behaviors**:
- [ ] All memorized expenses are displayed
- [ ] Add memorized navigates to add page
- [ ] Edit memorized navigates to edit page
- [ ] Delete memorized removes template (with confirmation)
- [ ] Use/Create navigates to add expense with pre-filled data
- [ ] List updates when group changes

### Add Memorized Expense Page (`/memorized/add`)
**Route**: `/memorized/add`
**Guards**: `authGuard`, `groupGuard`, `noCrawlerGuard`

**Functionality**:
- Similar to Add Expense but saves as reusable template
- Description input (required)
- Default amount (optional - can be left blank for variable amounts)
- Category selector
- Default paid by member (optional)
- Split method toggle (By Amount / By Percentage)
- Member allocation interface with same logic as Add Expense (see split allocation section)
- Save button
- Cancel button

**Testable Behaviors**:
- [ ] Form validation (description required)
- [ ] Default amount can be empty or filled
- [ ] Split method toggle works (By Amount / By Percentage)
- [ ] All split allocation logic works same as Add Expense
- [ ] Member allocations can be configured and saved
- [ ] Save creates memorized expense template with all allocation details
- [ ] Cancel returns to memorized list
- [ ] Created template appears in memorized list with correct details

### Edit Memorized Expense Page (`/memorized/:id`)
**Route**: `/memorized/:id`
**Guards**: `authGuard`, `groupGuard`, `noCrawlerGuard`
**Resolver**: `editMemorizedResolver`

**Functionality**:
- Same form as Add Memorized but pre-filled with template data
- All split allocation logic applies (see Add Expense section)
- Update button instead of Save
- Delete button

**Testable Behaviors**:
- [ ] Template data loads correctly into all fields
- [ ] Split method loads correctly (By Amount or By Percentage)
- [ ] Member allocations load correctly
- [ ] All fields are editable
- [ ] Split method can be changed
- [ ] All split allocation logic works same as Add Memorized
- [ ] Update saves changes to template
- [ ] Delete removes template (with confirmation)
- [ ] Non-existent ID shows error or redirects

---

## Analysis & Reporting

### Summary Page (`/analysis/summary`)
**Route**: `/analysis/summary`
**Guards**: `authGuard`, `groupGuard`

**Functionality**:
This page has two sections: a member-centric view of pairwise balances, and a group-wide Least Transfers Settlement view that calculates the minimum number of transactions needed to settle all debts at once.

**Page Components**:
- **Member Dropdown** (at top):
  - Select which member's summary to view
  - Defaults to currently logged-in user
  - Shows that member's balance with each other member in the group

- **Date Filter**:
  - Limits which expenses are included in both summary sections
  - Use case: Expenses entered in advance, but only want to pay through today
  - Filter applies to expense dates

- **Section 1 — Member-to-Member Summary Table**:
  - One row per member relationship (selected member ↔ another member)
  - Columns:
    - **Owed By**: Member who owes money
    - **Owed To**: Member who is owed money
    - **Amount**: Absolute value of amount (direction determined by column placement)
  - Selected member appears in either "Owed To" or "Owed By" column depending on direction
  - Only shows members with outstanding balances (includes inactive members if they have splits)

- **Pay Button** (on each row in Section 1):
  - Opens Payment Confirmation Dialog
  - Dialog shows payment service handles for the member in the "Owed To" column:
    - PayPal
    - Venmo
    - Zelle
    - CashApp
  - Handles only shown if member has entered them
  - Confirm button marks all splits between those two members as paid
  - Sets `paid` flag to `true` on all relevant splits
  - Creates history record with full category breakdown

- **Expandable Row Details** (Section 1):
  - Click any summary row to expand
  - Shows detailed breakdown of the balance by category
  - Click on expanded detail to **copy to clipboard**
  - Useful for sharing breakdown with other member

- **Section 2 — Least Transfers Settlement Table**:
  - Calculates the minimum number of payments needed to zero out all debts across the entire group
  - Uses a greedy net-balance algorithm: each member's net balance is computed, then the largest debtor is matched to the largest creditor
  - Example: If Alice owes Bob $40 and Bob owes Carol $40, Alice pays Carol $40 directly (one transfer instead of two)
  - Columns: **Pays From**, **Pays To**, **Amount**
  - Same date range filters apply as Section 1
  - No per-row pay buttons — settlement is an all-or-nothing group action

- **Settle Group Button** (below Section 2 table):
  - Opens Settle Group Confirmation Dialog
  - Dialog lists each expected transfer so members can verify before confirming
  - On confirmation:
    - All splits in the current date range are marked as `paid: true`
    - Parent expense `paid` status updated accordingly
    - One history record created per transfer row (no category breakdown / empty `splitsPaid`)
  - Demo mode blocks this action

**Copy-to-Clipboard Feature**:
- Available on expanded detail rows in Summary (Section 1) and Expenses pages
- On the History Detail page, a Copy button copies the payment summary for easy sharing

**Testable Behaviors**:

**Section 1 — Member-to-Member**:
- [ ] Member dropdown shows all group members
- [ ] Member dropdown defaults to logged-in user
- [ ] Selecting different member updates the summary table
- [ ] Summary table shows correct balances for selected member
- [ ] Each row shows correct Owed To / Owed By member placement
- [ ] Amount column shows absolute value
- [ ] Only members with outstanding balances are shown
- [ ] Inactive members included if they have unpaid splits
- [ ] Date filter limits expenses correctly
- [ ] Changing date filter updates balances
- [ ] Pay button opens Payment Confirmation Dialog
- [ ] Dialog shows payment handles if available for member owed
- [ ] Dialog shows all applicable payment services (PayPal, Venmo, Zelle, CashApp)
- [ ] Confirm button marks splits as paid (paid flag = true)
- [ ] After marking as paid, balance updates (row may disappear if fully settled)
- [ ] Row expansion shows category breakdown correctly
- [ ] Category breakdown totals match row balance
- [ ] Clicking expanded detail copies to clipboard
- [ ] Copy-to-clipboard provides properly formatted text
- [ ] Summary updates when expenses are added/edited/deleted
- [ ] Summary updates when group changes

**Section 2 — Least Transfers Settlement**:
- [ ] Least Transfers table is always visible below the member-to-member section
- [ ] Table shows correct minimum-transfer rows (verified by manual calculation)
- [ ] Algorithm correctly consolidates indirect debts (A→B→C simplifies to A→C)
- [ ] Same date range filters affect Least Transfers table as Section 1
- [ ] Changing date filter updates Least Transfers table
- [ ] When no outstanding expenses, table shows empty state message
- [ ] Settle Group button is visible when Least Transfers table has rows
- [ ] Settle Group button opens confirmation dialog
- [ ] Confirmation dialog lists all expected transfers
- [ ] Confirming settlement marks all filtered splits as paid
- [ ] Confirming settlement updates parent expense paid status correctly
- [ ] Settlement creates one history record per transfer row
- [ ] Settlement history records have empty splitsPaid (no category breakdown)
- [ ] After settlement, both tables show empty state
- [ ] Demo mode blocks Settle Group action with appropriate message
- [ ] Loading overlay is shown during settlement operation

### History Page (`/analysis/history`)
**Route**: `/analysis/history`
**Guards**: `authGuard`, `groupGuard`

**Functionality**:
This page is a **payment log** that records settlements made between members. It does NOT show individual expenses.

**Important Characteristics**:
- Records are created when the Pay button is used on the Summary page
- Each history record stores `splitsPaid`: an array of DocumentReferences to all splits that were paid as part of the payment
- Group settle records have an empty `splitsPaid` array (no individual split mapping)
- Group admins can "unpay" a payment from the History Detail page, which marks all splits as unpaid and deletes the history record

**Page Components**:
- **Member Dropdown**:
  - Filter to show only history records involving selected member
  - Shows records where member is either Paid To or Paid By

- **Date Filters**:
  - Start Date field (defaults to 30 days ago when page loads)
  - End Date field
  - Filters history records by payment date

- **History Table**:
  - Columns:
    - **Date**: Date of payment
    - **Paid To**: Member who received payment
    - **Paid By**: Member who made payment
    - **Amount**: Total amount paid
    - **Type**: Icon showing payment type — person icon for member-to-member payment, group icon for group settle
  - Default sort: Ascending date order (oldest first)
  - Sortable columns: Date, Paid To, Paid By (click header to sort)
  - Clicking a member payment row navigates to the **Payment Detail page**
  - Clicking a group settle row shows a snackbar: "Group settle payments don't have a breakdown available"

**What Creates History Records**:
- Using Pay button on Summary page (Section 1) creates a history record with `splitsPaid` containing all split refs paid
- Using Settle Group on Summary page (Section 2) creates one history record per transfer, with empty `splitsPaid` (no breakdown)
- Individual split payments made on Expenses page do NOT create history records

**Testable Behaviors**:
- [ ] Member dropdown filters records correctly
- [ ] Only records involving selected member are shown
- [ ] Start date defaults to 30 days ago on page load
- [ ] End date filter works correctly
- [ ] Date range filtering works correctly
- [ ] Default sort is ascending by date
- [ ] Clicking Date header toggles sort order
- [ ] Clicking Paid To header sorts by that column
- [ ] Clicking Paid By header sorts by that column
- [ ] All history records for current group are shown (within filters)
- [ ] Table shows correct columns: Date, Paid To, Paid By, Amount, Type
- [ ] Type column shows person icon for member-to-member payments
- [ ] Type column shows group icon for group settle payments
- [ ] Clicking member payment row navigates to Payment Detail page
- [ ] Clicking group settle row shows snackbar notification
- [ ] History updates when group changes
- [ ] Empty state shown when no history records match filters

### Payment Detail Page (`/analysis/history/:id`)
**Route**: `/analysis/history/:id`
**Guards**: `authGuard`, `groupGuard`, `noCrawlerGuard`

**Functionality**:
Shows the full breakdown of a single payment, including every split that was paid and a category summary. Provides admin controls to unpay splits or the entire payment.

**Page Components**:
- **Back Button**: Returns to History page
- **Payment Summary**: Paid By, Paid To, Date, Total Amount
- **Copy Button**: Copies payment summary text to clipboard
- **Unpay Payment Button** (admin only): Opens confirmation dialog and unpays all splits, then deletes the history record
- **Splits Table**: Each split that was paid, with Date, Category, Amount, and (admin) Unpay button per row
- **Category Summary Table**: Aggregated amounts per category

**Unpay All Logic**:
- All splits referenced in `splitsPaid` are marked `paid: false`
- All unique related expenses are marked `paid: false`
- The history record is deleted from Firestore
- User is navigated back to History page

**Unpay Single Split Logic**:
- The selected split is marked `paid: false`
- The related expense is marked `paid: false`
- The split's DocumentReference is removed from the history record's `splitsPaid` array
- `totalPaid` is recalculated: decreased by `allocatedAmount` if the split was a positive direction (payer owed payee), increased if negative direction (payee owed payer)
- If `splitsPaid` becomes empty after removal, the history record is deleted and user is navigated back

**Testable Behaviors**:
- [ ] Page loads splits correctly from splitsPaid refs
- [ ] Splits table shows Date, Category, Amount for each split
- [ ] Category summary correctly aggregates amounts by category
- [ ] Copy button copies formatted payment summary to clipboard
- [ ] Unpay Payment button only visible to admins
- [ ] Unpay split button only visible to admins
- [ ] Unpay Payment confirmation dialog shows correct count and warning
- [ ] Unpay Payment marks all splits as unpaid, marks expenses as unpaid, deletes history record
- [ ] Unpay single split marks that split as unpaid, updates history record totalPaid and splitsPaid
- [ ] Unpaying last split in record deletes the history record and navigates back
- [ ] Demo mode blocks unpay actions
- [ ] Help dialog shows payment detail help content

---

## Utility Pages

### Home Page (`/`)
**Route**: `/`
**No guards**

**Functionality**:
- Landing page for the application
- Welcome message
- Call-to-action buttons (Login, Register, Demo)
- Brief description of features
- May show statistics or testimonials

**Testable Behaviors**:
- [ ] Page loads for all user states
- [ ] Login/Register buttons navigate correctly
- [ ] Demo button enters demo mode
- [ ] Links to Help and About work

### Help Page (`/help`)
**Route**: `/help`
**No guards**

**Functionality**:
- FAQ or documentation
- User guide
- How-to instructions
- May include videos or tutorials
- Contact/support information

**Testable Behaviors**:
- [ ] Page loads correctly
- [ ] Help content is readable
- [ ] Links within help work
- [ ] Search functionality works (if present)

### About Page (`/about`)
**Route**: `/about`
**No guards**

**Functionality**:
- Information about the application
- Credits
- Version information
- Privacy policy link
- Terms of service link

**Testable Behaviors**:
- [ ] Page loads correctly
- [ ] Version number is displayed
- [ ] Links to external resources work

### Split Page (`/split`)
**Route**: `/split`
**No guards** (accessible without authentication)

**Functionality**:
A standalone quick expense calculator for splitting bills without requiring login or group membership. Similar to Add Expense page but simplified for ad-hoc scenarios.

**Use Case**:
- Quick splits for non-group scenarios (e.g., dinner with friends not in the app)
- Calculate split including tax & tip
- Share breakdown via copy-to-clipboard
- No data is saved - purely a calculator

**Two States:**

#### 1. Entry Screen

**Differences from Add Expense Page:**
- **Currency Selector**: Choose currency before starting (not tied to group settings)
- **No Date Field**: Not applicable for quick calculator
- **No Category Field**: Not applicable for quick calculator
- **Text Inputs for Names**: Member dropdown replaced with manual text entry (no group members)
- **Generate Summary Button**: Instead of Save button
- **Reset Button**: Clear all data and start over

**Fields:**
- Currency selector dropdown
- Amount input (Total Amount)
- Paid by text input (manual name entry)
- Split method toggle button (By Amount / By Percentage)
- Member allocation interface:
  - Text input for each person's name (not dropdown)
  - Same allocation logic as Add Expense (see Add Expense section for details)
  - Member Amount, Proportional Amount, Evenly Shared Remainder (for By Amount)
  - Percentage inputs (for By Percentage)

**Split Allocation:**
- Uses same allocation logic as Add Expense page
- By Amount method: Member Amount + Proportional Amount + Evenly Shared Remainder
- By Percentage method: Percentage per person
- Same rounding adjustment logic
- See Add Expense section for complete calculation details

#### 2. Summary Screen

**Generated after clicking "Generate Summary"**

**Displays:**
- Breakdown of who owes what
- Shows each person's allocated amount
- Formatted for easy reading and sharing

**Actions:**
- **Copy to Clipboard Button**: Copies the entire breakdown for sharing
- **Edit Splits Button**: Returns to entry screen with all data intact (allows corrections)
- **Start Over Button**: Returns to entry screen with all data cleared (fresh start)

**Testable Behaviors:**

**Entry Screen:**
- [ ] Page loads without authentication required
- [ ] Currency selector shows available currencies
- [ ] Selecting currency updates amount input formatting
- [ ] Amount input accepts decimal values appropriate for selected currency
- [ ] Paid by text input accepts name
- [ ] Split method toggle switches between By Amount and By Percentage
- [ ] Can add/remove people (split lines)
- [ ] Name text inputs accept any text
- [ ] All split allocation logic works same as Add Expense
- [ ] By Amount split: Member Amount, Proportional Amount, Evenly Shared Remainder
- [ ] By Percentage split: Percentages auto-calculate for last person
- [ ] Reset button clears all fields
- [ ] Reset button prompts for confirmation if data entered
- [ ] Generate Summary button validates input before proceeding
- [ ] Validation shows errors for incomplete/invalid data

**Summary Screen:**
- [ ] Summary displays correct breakdown
- [ ] Each person's allocated amount is shown correctly
- [ ] Amounts sum to total expense amount
- [ ] Copy to Clipboard button copies formatted breakdown
- [ ] Copied text is properly formatted for sharing
- [ ] Edit Splits button returns to entry with data preserved
- [ ] All previously entered data is intact after Edit Splits
- [ ] Start Over button returns to entry with cleared data
- [ ] Start Over prompts for confirmation
- [ ] Currency formatting is correct in summary

**General:**
- [ ] Works on mobile and desktop
- [ ] No data is saved or persisted
- [ ] Refreshing page clears all data
- [ ] Can be used multiple times without login
- [ ] Does not create expenses in any group
- [ ] Does not require or interact with user account

### Demo Mode (`/demo/*`)
**Route**: `/demo/*`
**Guard**: `loggedInGuard` (must NOT be logged in)

**Functionality**:
- Parallel set of all main routes with demo data
- Pre-populated with sample groups, members, expenses, memorized expenses, and history records
- Data is loaded into in-memory stores on first visit to a demo route and cleared when leaving demo routes
- **CRUD operations are blocked**: Any attempt to add, edit, or delete data shows a snackbar: "Data modification is disabled in demo mode" — the in-memory data is not updated
- Allows users to explore without creating account
- Exit demo button returns to home

**Demo Routes**:
- `/demo/groups`
- `/demo/members`
- `/demo/categories`
- `/demo/expenses`
- `/demo/memorized`
- `/demo/summary`
- `/demo/history`
- `/demo/split`
- `/demo/help`

**Testable Behaviors**:
- [ ] Demo mode accessible when not logged in
- [ ] Demo data is pre-populated (groups, members, categories, expenses, memorized, history)
- [ ] Read-only features work correctly with demo data (filtering, sorting, expanding rows, etc.)
- [ ] Attempting to add, edit, or delete any data shows snackbar: "Data modification is disabled in demo mode"
- [ ] In-memory data is unchanged after a blocked CRUD attempt
- [ ] Exiting demo routes clears all demo data from stores
- [ ] Re-entering demo routes re-initializes demo data
- [ ] Exit demo returns to home
- [ ] Cannot access demo when logged in

### Admin Pages (`/admin/*`)
**Route**: `/admin/*`
**Guards**: `authGuard`, `adminGuard`

**Functionality**:
- Statistics page showing app-wide usage metrics (user counts, group counts, expense totals, etc.)
- Restricted to the app owner only — no regular user will ever have access
- Not part of the normal user-facing application

**Testing Note**: This section is out of scope for e2e testing. It is only accessible to the app owner and does not represent functionality available to any other user.

---

## Data Flows

### Creating an Expense Flow
1. User navigates to `/expenses`
2. Clicks "Add Expense" button
3. Navigates to `/expenses/add`
4. Fills out expense form:
   - Selects date
   - Enters description
   - Enters amount
   - Selects category
   - Selects who paid
   - Selects split method
   - Configures member allocations
5. Clicks Save
6. Expense is created in Firestore
7. User is redirected back to `/expenses`
8. New expense appears in the list

**Alternative Flow - From Memorized**:
1. User navigates to `/memorized`
2. Clicks "Use" on a memorized expense
3. Navigates to `/expenses/add` with pre-filled data
4. Continues from step 4 above

### Group Management Flow
1. User logs in
2. Navigates to `/administration/groups`
3. Views list of their groups
4. Creates new group or selects existing group
5. Current group is stored in application state
6. Navigation unlocks to show Members, Categories, etc.
7. User can switch groups at any time
8. Switching groups reloads all data for new group context

### User Registration to First Expense Flow
1. New user visits home page
2. Clicks Register
3. Fills out registration form
4. Account created, user logged in
5. Redirected to home
6. Navigates to Groups
7. Creates first group
8. Selects the group
9. Navigates to Members
10. Adds group members
11. Navigates to Categories
12. Adds expense categories
13. Navigates to Expenses
14. Adds first expense
15. Views Summary to see balances

### Settlement Flow - Three Methods

The app provides three different ways to mark splits as paid, each with different purposes:

#### Method 1: Summary Page Pay Button (Pairwise Payment with History)
**Use Case**: Settling up all expenses between two specific members at once

1. User navigates to Summary page
2. Selects member from dropdown (defaults to logged-in user)
3. Views balances with each other member
4. Clicks Pay button on the summary row
5. Payment Confirmation Dialog opens
6. Views payment service handles for member owed (if available)
7. Makes real-world payment (Venmo, PayPal, cash, etc.)
8. Clicks Confirm button
9. **All splits** between those two members are marked as paid (`paid` flag = true)
10. **History record is created** with:
    - Payment date, amount, members involved
    - `splitsPaid`: array of DocumentReferences to all splits paid
11. Summary table updates (row may disappear if fully settled)
12. User can view payment receipt in History Detail page

**Key Characteristics**:
- Marks ALL splits between two members (not just one expense)
- Creates permanent history record with split refs (allows unpay from History Detail page)
- Shows payment service handles
- Typical use: Monthly settlement between two roommates

#### Method 2: Summary Page Settle Group Button (Group-wide Settlement)
**Use Case**: Settling all outstanding debts across the entire group in one action, using the minimum number of transfers

1. User navigates to Summary page
2. Optionally sets date range filters
3. Views the Least Transfers Settlement table (Section 2) showing minimum transfers needed
4. Members make real-world transfers as shown in the table
5. User clicks Settle Group button
6. Settle Group Confirmation Dialog opens, listing all expected transfers
7. User confirms all transfers have been completed
8. **All filtered splits** are marked as paid (`paid` flag = true)
9. Parent expense `paid` status updated accordingly
10. **One history record per transfer** is created with date and amount, but **no category breakdown** (empty `splitsPaid`)
11. Both summary sections update (show empty state when fully settled)

**Key Characteristics**:
- Marks ALL splits in the current date range as paid (all members, not just two)
- Creates history records without category breakdown
- No payment service handles shown (transfers arranged out-of-band)
- Uses minimum-transfer algorithm to calculate optimal payment plan
- Typical use: Periodic group-wide settlement (end of month, end of trip)

#### Method 3: Expenses Page Individual Split Button (Single Split, No History)
**Use Case**: Marking individual expense splits as paid separately

1. User navigates to Expenses page
2. Finds specific expense in the list
3. Clicks down arrow to expand split details
4. Views all splits for that expense
5. Makes real-world payment for one person's share
6. Clicks Mark Paid/Unpaid button (green $ icon) for that split
7. **Only that single split** is marked as paid (`paid` flag = true)
8. Button turns red to indicate paid status
9. **No history record is created**
10. User can later mark as unpaid if needed (click red button)

**Key Characteristics**:
- Marks only ONE split at a time
- No history record created
- Can toggle paid/unpaid status
- Button changes color (green = unpaid, red = paid)
- Typical use: Individual expense settlement, not bulk payment

#### Comparison

| Feature | Summary — Pay Button | Summary — Settle Group | Expenses — Split Button |
|---------|---------------------|------------------------|------------------------|
| Scope | All splits between 2 members | All splits in date range (entire group) | Single split only |
| History Record | Yes — with split refs | Yes — no split refs | No |
| Payment Handles | Shows service handles | Not shown | Not shown |
| Unpay / Undo | Admin: Unpay all or per-split on History Detail page | Not available (no split refs) | Yes — click red button |
| Typical Use | Pairwise monthly settlement | Group-wide periodic settlement | Individual expense payment |

---

## Testing Considerations

### Loading States
- The app uses a `LoadingService` with full-screen overlay that covers the entire UI during async operations
- The overlay effectively disables all user interaction — individual form disabling is unnecessary and not done
- Loading indicator should appear for async operations

### Responsive Design
- Test both desktop (>1100px) and mobile (≤1100px) layouts
- Navigation changes significantly between breakpoints
- Forms should be usable on mobile devices

### Authentication States
- Test behavior for logged-out users
- Test behavior for logged-in users without groups
- Test behavior for logged-in users with groups
- Test demo mode separately

### Data Validation
- Form validation should prevent invalid data
- Server-side validation may add additional checks
- Error messages should be clear and helpful

### Guards & Permissions
- Route guards should redirect unauthorized users
- Some routes require authentication
- Some routes require group selection
- Some routes are admin-only

---

## Next Steps

This is a living document. As we develop e2e tests, we should:
1. Add specific test case IDs
2. Document expected error messages
3. Add screenshots of UI elements
4. Document specific test data requirements
5. Add notes on any discovered edge cases
6. Update as features are added or changed
