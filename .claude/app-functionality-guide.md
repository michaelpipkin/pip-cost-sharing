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

**Testable Behaviors**:
- [ ] All user's groups are displayed
- [ ] Current group is visually indicated
- [ ] Add group dialog opens and creates new group
- [ ] Edit group dialog opens and updates group
- [ ] Delete group removes group (with confirmation)
- [ ] Switching groups updates the current group
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
  - Member email (optional)
  - Active/Inactive status
  - Default split percentage (optional)

**Testable Behaviors**:
- [ ] All members of current group are displayed
- [ ] Add member dialog creates new member
- [ ] Edit member dialog updates member
- [ ] Delete member removes member (with confirmation)
- [ ] Cannot delete member if they have expenses
- [ ] Active/inactive status can be toggled
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
  - Category icon/color
  - Active/Inactive status

**Testable Behaviors**:
- [ ] All categories of current group are displayed
- [ ] Add category dialog creates new category
- [ ] Edit category dialog updates category
- [ ] Delete category removes category (with confirmation)
- [ ] Cannot delete category if it has expenses
- [ ] Active/inactive status can be toggled
- [ ] Category list updates when group changes

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
- Expense row/card shows:
  - Date
  - Description
  - Category
  - Total amount
  - Who paid
  - Split method indicator
  - Members involved

**Testable Behaviors**:
- [ ] All expenses for current group are displayed
- [ ] Filtering by date works correctly
- [ ] Filtering by category works correctly
- [ ] Filtering by member works correctly
- [ ] Search by description works correctly
- [ ] Sorting works correctly
- [ ] Multiple filters can be combined
- [ ] Add expense navigates to add page
- [ ] Edit expense navigates to edit page
- [ ] Delete expense removes expense (with confirmation)
- [ ] Clone expense pre-fills add form
- [ ] Pagination works if many expenses
- [ ] Expense list updates when group changes

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
This page provides a member-centric view of balances (not a group-wide simplified settlement).

**Page Components**:
- **Member Dropdown** (at top):
  - Select which member's summary to view
  - Defaults to currently logged-in user
  - Shows that member's balance with each other member in the group

- **Date Filter**:
  - Limits which expenses are included in the summary
  - Use case: Expenses entered in advance, but only want to pay through today
  - Filter applies to expense dates

- **Summary Table**:
  - One row per member relationship (selected member ↔ another member)
  - Columns:
    - **Owed To**: Member who is owed money
    - **Owed By**: Member who owes money
    - **Balance**: Absolute value of amount (direction determined by column placement)
  - Selected member appears in either "Owed To" or "Owed By" column depending on direction
  - Only shows members with outstanding balances (includes inactive members if they have splits)

- **Pay Button** (on each row):
  - Opens Payment Confirmation Dialog
  - Dialog shows payment service handles for the member in the "Owed To" column:
    - PayPal
    - Venmo
    - Zelle
    - CashApp
  - Handles only shown if member has entered them
  - Confirm button marks all splits between those two members as paid
  - Sets `paid` flag to `true` on all relevant splits

- **Expandable Row Details**:
  - Click any summary row to expand
  - Shows detailed breakdown of the balance by category
  - Click on expanded detail to **copy to clipboard**
  - Useful for sharing breakdown with other member

**Copy-to-Clipboard Feature**:
- Available on expanded detail rows in Summary, Expenses, and History pages
- Clicking copies the detail breakdown for easy sharing

**Testable Behaviors**:
- [ ] Member dropdown shows all group members
- [ ] Member dropdown defaults to logged-in user
- [ ] Selecting different member updates the summary table
- [ ] Summary table shows correct balances for selected member
- [ ] Each row shows correct Owed To / Owed By member placement
- [ ] Balance column shows absolute value
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

**Future Enhancement Consideration**:
- Group-wide simplified settlement view (minimize number of transactions for entire group)

### History Page (`/analysis/history`)
**Route**: `/analysis/history`
**Guards**: `authGuard`, `groupGuard`

**Functionality**:
- Chronological list of all expenses
- May include filters similar to Expenses page
- May show running balance over time
- May include export functionality
- Shows expense details similar to Expenses page

**Testable Behaviors**:
- [ ] All expenses shown chronologically
- [ ] Filters work correctly
- [ ] Export functionality works (if present)
- [ ] Updates when expenses change
- [ ] Updates when group changes

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
**No guards**

**Functionality**:
- Quick expense splitting calculator
- Works without authentication
- Simple interface:
  - Total amount input
  - Number of people or list of people
  - Calculate button
  - Shows amount per person
- May allow saving as expense if logged in

**Testable Behaviors**:
- [ ] Works without login
- [ ] Calculates split correctly
- [ ] Updates when inputs change
- [ ] Handles decimal amounts
- [ ] Can save to expenses if logged in with group

### Demo Mode (`/demo/*`)
**Route**: `/demo/*`
**Guard**: `loggedInGuard` (must NOT be logged in)

**Functionality**:
- Parallel set of all main routes with demo data
- Pre-populated with sample groups, members, expenses
- All CRUD operations work but don't persist
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
- [ ] Demo data is pre-populated
- [ ] All features work with demo data
- [ ] Changes don't persist across sessions
- [ ] Exit demo returns to home
- [ ] Cannot access demo when logged in

### Admin Pages (`/admin/*`)
**Route**: `/admin/*`
**Guards**: `authGuard`, `adminGuard`

**Functionality**:
- Statistics page showing app-wide metrics
- Only accessible to admin users
- Shows user counts, group counts, expense totals, etc.

**Testable Behaviors**:
- [ ] Only accessible to admin users
- [ ] Statistics display correctly
- [ ] Regular users cannot access

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

### Settlement Flow
1. User views Summary page
2. Sees who owes whom
3. Makes real-world payment
4. (Optional) Records payment as negative expense
5. Summary updates to show new balances

---

## Testing Considerations

### Loading States
- The app uses a `LoadingService` with full-screen overlay
- Forms should be disabled during loading
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
