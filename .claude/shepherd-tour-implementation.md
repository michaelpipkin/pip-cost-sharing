# Shepherd.js Tour Implementation Plan

**Project:** PipSplit Cost Sharing Application
**Feature:** Interactive guided tours for demo mode
**Library:** Shepherd.js v14.5.1
**Created:** 2025-10-15

---

## Overview

Add interactive guided tours using Shepherd.js to the demo mode pages to help users discover and understand key features of the application. Tours will only appear in demo mode (`/demo/*` routes) and provide step-by-step walkthroughs of major functionality.

---

## Architecture

### Tour Service Pattern
- **Centralized Service:** `src/app/services/tour.service.ts`
  - Manages all tour definitions and state
  - Integrates with existing `DemoService` to only show tours in demo mode
  - Tracks tour completion state in localStorage
  - Provides methods to start/stop specific tours
  - Handles Shepherd.js instance lifecycle

### Tour Definitions
Each tour will be defined as a configuration object containing:
- **Tour ID:** Unique identifier (e.g., 'welcome-tour', 'expenses-tour')
- **Steps:** Array of step configurations with:
  - Element selector (CSS selector to attach to)
  - Title and description text
  - Button configurations (Next, Back, Skip, Finish)
  - Positioning preferences
  - Optional callbacks (beforeShow, afterShow, etc.)

### Integration Points
1. **DemoService Integration:**
   - Check `demoService.isInDemoMode()` before showing tours
   - Only initialize tours on demo routes

2. **LocalStorage State:**
   - Key: `pipsplit_tour_completed_{tourId}`
   - Value: `true` | `false`
   - Allows users to skip tours on repeat visits
   - Provide "Reset Tours" option in demo mode

3. **Component Integration:**
   - Tours auto-start on first visit to specific demo pages
   - Manual tour trigger via help button or "Show Tour" link
   - Non-blocking: users can dismiss and continue exploring

---

## Tour Specifications

### 1. Welcome Tour (Priority: HIGH)
**Route:** `/demo/administration/groups`
**Auto-start:** Yes (on first demo visit)
**Steps:**

1. **Welcome Message**
   - Attached to: Main content area
   - Title: "Welcome to PipSplit Demo!"
   - Description: "This is a fully interactive demo with sample data. Let's take a quick tour to show you around! (All changes are read-only in demo mode.)"
   - Buttons: [Next, Skip Tour]

2. **Sample Data**
   - Attached to: Groups table/list
   - Title: "Your Demo Group"
   - Description: "We've set up a sample group with three members: Alice, Bob, and Charlie. This group has shared expenses you can explore."
   - Buttons: [Back, Next, Skip]

3. **Navigation Menu**
   - Attached to: Side navigation or toolbar menu
   - Title: "Navigate the App"
   - Description: "Use this menu to explore different sections: Expenses, Analysis, and Memorized Expenses."
   - Buttons: [Back, Next, Skip]

4. **View/Edit Restrictions**
   - Attached to: Add/Edit button (disabled state)
   - Title: "Demo Mode Restrictions"
   - Description: "You can view all data, but creating or editing is disabled in demo mode. Create a free account to use all features!"
   - Buttons: [Back, Next, Skip]

5. **Next Steps**
   - Attached to: Expenses navigation link
   - Title: "Explore Expenses"
   - Description: "Let's look at the expenses next! We've created sample expenses to show you how splits work."
   - Buttons: [Back, Go to Expenses]

### 2. Expenses Tour (Priority: HIGH)
**Route:** `/demo/expenses`
**Auto-start:** Yes (on first visit OR from Welcome Tour)
**Steps:**

1. **Expense List Introduction**
   - Attached to: Expenses table/list
   - Title: "Your Shared Expenses"
   - Description: "Here are all expenses shared within your group. You can see who paid, the amount, and how it was split."
   - Buttons: [Next, Skip Tour]

2. **Expense Details**
   - Attached to: First expense row or view button
   - Title: "View Expense Details"
   - Description: "Click any expense to see the full breakdown: who paid, who owes, and how the split was calculated."
   - Buttons: [Back, Next, Skip]

3. **Split Types**
   - Attached to: Expense with interesting split (if visible)
   - Title: "Different Split Types"
   - Description: "PipSplit supports equal splits, custom amounts, percentages, and shares. Each expense can use the best method for your situation."
   - Buttons: [Back, Next, Skip]

4. **Add Expense (Disabled)**
   - Attached to: Add Expense button
   - Title: "Adding Expenses"
   - Description: "In the full version, you can add expenses here with photos, receipts, and detailed split information. Sign up to try it!"
   - Buttons: [Back, Next, Skip]

5. **Summary Navigation**
   - Attached to: Summary/Analysis navigation link
   - Title: "See Who Owes What"
   - Description: "Ready to see the summary? The Analysis section shows you exactly who needs to pay whom."
   - Buttons: [Back, Go to Summary]

### 3. Summary Tour (Priority: MEDIUM)
**Route:** `/demo/analysis/summary`
**Auto-start:** Yes (on first visit OR from Expenses Tour)
**Steps:**

1. **Summary Introduction**
   - Attached to: Summary content area
   - Title: "Payment Summary"
   - Description: "This is where the magic happens! We calculate the optimal way to settle all debts with the fewest transactions."
   - Buttons: [Next, Skip Tour]

2. **Payment Flow**
   - Attached to: Payment flow diagram/list
   - Title: "Who Owes Whom"
   - Description: "These are the payments needed to settle everyone up. Each arrow shows a direct payment that will balance the group."
   - Buttons: [Back, Next, Skip]

3. **Settlement Suggestions**
   - Attached to: Payment amounts or settlement details
   - Title: "Simplified Settlements"
   - Description: "Our algorithm minimizes the number of transactions. Instead of everyone paying everyone, we find the most efficient path."
   - Buttons: [Back, Finish Tour]

### 4. History Tour (Priority: LOW)
**Route:** `/demo/analysis/history`
**Auto-start:** No (manual trigger only)
**Steps:**

1. **History Introduction**
   - Title: "Payment History"
   - Description: "Track past settlements and see who paid whom over time."
   - Buttons: [Next, Skip Tour]

2. **History Records**
   - Attached to: History table/list
   - Title: "Historical Payments"
   - Description: "All recorded settlements appear here with dates, amounts, and involved members."
   - Buttons: [Back, Finish]

### 5. Memorized Expenses Tour (Priority: LOW)
**Route:** `/demo/memorized`
**Auto-start:** No (manual trigger only)
**Steps:**

1. **Memorized Introduction**
   - Title: "Memorized Expenses"
   - Description: "Save recurring expenses (rent, utilities, subscriptions) as templates for quick entry."
   - Buttons: [Next, Skip Tour]

2. **Quick Entry**
   - Attached to: Memorized expense template
   - Title: "Reuse Templates"
   - Description: "Click a memorized expense to quickly add it with pre-filled details. Perfect for monthly bills!"
   - Buttons: [Back, Finish]

---

## Implementation TODOs

### Phase 1: Tour Service Foundation
- [ ] **TODO 1.1:** Create `src/app/services/tour.service.ts`
  - Injectable service with singleton pattern
  - Import Shepherd and type definitions
  - Add dependency on `DemoService` for demo mode checking
  - Add `Router` dependency for navigation between tours

- [ ] **TODO 1.2:** Implement tour state management
  - Create localStorage helper methods:
    - `isTourCompleted(tourId: string): boolean`
    - `markTourCompleted(tourId: string): void`
    - `resetAllTours(): void`
  - Add signal or BehaviorSubject for active tour state

- [ ] **TODO 1.3:** Configure default Shepherd.js options
  - Set default theme (Material-compatible styling)
  - Configure default button classes (Angular Material styles)
  - Set up default positioning (using Floating UI)
  - Define modal overlay settings

- [ ] **TODO 1.4:** Create tour definition interface/type
  - Define TypeScript interface for tour configuration
  - Create step configuration type
  - Add type for tour callbacks and hooks

### Phase 2: Welcome Tour Implementation
- [ ] **TODO 2.1:** Define Welcome Tour configuration
  - Create tour with 5 steps as specified above
  - Add element selectors for each step
  - Configure step positioning and buttons

- [ ] **TODO 2.2:** Add Welcome Tour to TourService
  - Implement `startWelcomeTour()` method
  - Add auto-start logic for first demo visit
  - Handle "Go to Expenses" button navigation

- [ ] **TODO 2.3:** Integrate Welcome Tour into demo groups component
  - Inject `TourService` into groups component
  - Check if tour should auto-start in `ngAfterViewInit()`
  - Add "Show Tour" button to component (optional)

- [ ] **TODO 2.4:** Test Welcome Tour
  - Verify all steps appear correctly
  - Test element highlighting
  - Verify navigation works
  - Test skip/complete functionality
  - Verify localStorage state persistence

### Phase 3: Expenses Tour Implementation
- [ ] **TODO 3.1:** Define Expenses Tour configuration
  - Create tour with 5 steps as specified above
  - Add element selectors for expense-specific elements
  - Configure navigation to Summary tour

- [ ] **TODO 3.2:** Add Expenses Tour to TourService
  - Implement `startExpensesTour()` method
  - Add auto-start logic (if coming from Welcome Tour OR first visit)
  - Handle "Go to Summary" button navigation

- [ ] **TODO 3.3:** Integrate Expenses Tour into expenses component
  - Inject `TourService` into expenses list component
  - Check for auto-start conditions
  - Add manual tour trigger option

- [ ] **TODO 3.4:** Test Expenses Tour
  - Verify step flow
  - Test transition from Welcome Tour
  - Verify element targeting
  - Test manual restart

### Phase 4: Summary Tour Implementation
- [ ] **TODO 4.1:** Define Summary Tour configuration
  - Create tour with 3 steps as specified above
  - Target payment flow visualization elements
  - Configure final step completion

- [ ] **TODO 4.2:** Add Summary Tour to TourService
  - Implement `startSummaryTour()` method
  - Add auto-start logic (if coming from Expenses Tour OR first visit)

- [ ] **TODO 4.3:** Integrate Summary Tour into summary component
  - Inject `TourService` into summary component
  - Check for auto-start conditions
  - Add manual tour trigger

- [ ] **TODO 4.4:** Test Summary Tour
  - Verify all steps work
  - Test transition from Expenses Tour
  - Verify payment flow highlighting

### Phase 5: Additional Tours (History, Memorized)
- [ ] **TODO 5.1:** Implement History Tour
  - Define tour configuration (2 steps)
  - Add to TourService as manual-only tour
  - Integrate into history component
  - Test functionality

- [ ] **TODO 5.2:** Implement Memorized Expenses Tour
  - Define tour configuration (2 steps)
  - Add to TourService as manual-only tour
  - Integrate into memorized component
  - Test functionality

### Phase 6: Styling and Polish
- [ ] **TODO 6.1:** Create custom Shepherd theme CSS
  - Match Angular Material design system
  - Style buttons to match app buttons
  - Configure tooltip appearance
  - Set proper z-index for overlays

- [ ] **TODO 6.2:** Import Shepherd CSS and custom styles
  - Add Shepherd base CSS to angular.json or global styles
  - Import custom theme overrides
  - Test across different screen sizes

- [ ] **TODO 6.3:** Add responsive behavior
  - Adjust tour steps for mobile/tablet viewports
  - Update positioning for smaller screens
  - Consider disabling tours on very small screens

### Phase 7: User Experience Enhancements
- [ ] **TODO 7.1:** Add "Reset Tours" functionality
  - Create method in TourService to clear all tour state
  - Add UI element in demo mode (e.g., help page or settings)
  - Show confirmation dialog before reset

- [ ] **TODO 7.2:** Add "Show Tour" triggers
  - Add help icon/button to show tour on each page
  - Display subtle hint if user hasn't taken tour
  - Make tours easily re-accessible

- [ ] **TODO 7.3:** Add tour completion tracking
  - Track which tours user has completed
  - Show progress indicator (optional)
  - Celebrate completion of all tours (optional)

- [ ] **TODO 7.4:** Add call-to-action at tour completion
  - Final step of tour chain encourages signup
  - Link to registration page with demo context
  - Track conversion from demo tours (analytics)

### Phase 8: Testing and Refinement
- [ ] **TODO 8.1:** Cross-browser testing
  - Test on Chrome, Firefox, Safari, Edge
  - Verify positioning works correctly
  - Test mobile browsers

- [ ] **TODO 8.2:** Accessibility review
  - Ensure keyboard navigation works
  - Verify screen reader compatibility
  - Test focus management

- [ ] **TODO 8.3:** Performance check
  - Verify no blocking of main thread
  - Check bundle size impact
  - Lazy load Shepherd if needed

- [ ] **TODO 8.4:** User testing
  - Get feedback from real users
  - Adjust tour content based on feedback
  - Refine step sequences

### Phase 9: Documentation and Cleanup
- [ ] **TODO 9.1:** Add inline code documentation
  - Document TourService methods
  - Add JSDoc comments for tour configurations
  - Document integration patterns

- [ ] **TODO 9.2:** Update project documentation
  - Add tour feature to README (if applicable)
  - Document tour customization process
  - Add troubleshooting guide

- [ ] **TODO 9.3:** Final code review
  - Remove any console.logs or debug code
  - Ensure consistent code style
  - Run linter and fix issues

---

## Key Implementation Details

### Shepherd.js TypeScript Type System

**IMPORTANT: Type Usage Patterns to Prevent Compilation Errors**

When working with Shepherd.js types, follow these patterns to avoid TypeScript errors:

#### 1. Import Types Separately
`Tour` and `TourOptions` are **separate types**, not a namespace:

```typescript
import type { Tour, TourOptions } from 'shepherd.js';

// ✅ CORRECT
private defaultTourOptions: TourOptions = { ... };
private currentTour: Tour | null = null;

// ❌ WRONG - Tour is not a namespace!
private defaultTourOptions: Tour.TourOptions = { ... };
```

#### 2. Button Action Context
Button actions are automatically bound to the **`Tour` instance**, NOT the `Step`:

```typescript
// ✅ CORRECT - 'this' is the Tour instance
{
  text: 'Next',
  action: function (this: Tour) {
    this.next();  // Tour has navigation methods
  }
}

// ❌ WRONG - Step doesn't have navigation methods
{
  text: 'Next',
  action: function (this: Step) {
    this.next();  // ERROR: Step has no next() method!
  }
}
```

**Available Methods by Type:**
- **`Tour` methods:** `next()`, `back()`, `complete()`, `cancel()`, `show()`, `hide()`, `start()`
- **`Step` methods:** `complete()`, `cancel()`, `hide()`, `show()` (no navigation methods like next/back)

#### 3. Dynamic Import for Runtime
Use dynamic import to avoid adding Shepherd to initial bundle:

```typescript
// Shepherd is only loaded when actually needed
const Shepherd = (await import('shepherd.js')).default;
const tour = new Shepherd.Tour(options);
```

**Result:** Shepherd.js is lazy-loaded (~55 KB chunk, ~17 KB compressed)

#### 4. Type-Only Imports
Use `import type` for type definitions to ensure zero runtime cost:

```typescript
import type { Tour, TourOptions } from 'shepherd.js';  // Type-only, no bundle impact
```

---

## Technical Considerations

### Element Selectors Strategy
- Use **data attributes** for tour targets where possible:
  - `data-tour="welcome-group-table"`
  - `data-tour="expenses-list"`
  - More stable than class-based selectors
  - Explicit intent for tour integration

- Fallback to **semantic selectors**:
  - CSS classes (`.expense-table`)
  - IDs (when unique and stable)

### Timing and Lifecycle
- **AfterViewInit Hook:** Start tours in `ngAfterViewInit()` to ensure DOM elements exist
- **Delay for animations:** Add small delay if Material animations affect element availability
- **Destroy on component destroy:** Clean up Shepherd instances in `ngOnDestroy()`

### Tour State Management
- **LocalStorage keys:**
  - `pipsplit_tour_completed_welcome`
  - `pipsplit_tour_completed_expenses`
  - `pipsplit_tour_completed_summary`
  - `pipsplit_tour_completed_history`
  - `pipsplit_tour_completed_memorized`

- **First-time demo visitor:**
  - Auto-start Welcome Tour on `/demo/administration/groups`
  - Chain to Expenses and Summary if user completes

- **Returning demo visitor:**
  - Skip auto-start if tour completed
  - Provide manual trigger to replay

### Navigation Between Tours
- **Seamless transitions:**
  - "Go to Expenses" button in Welcome Tour navigates and auto-starts Expenses Tour
  - "Go to Summary" button in Expenses Tour navigates and auto-starts Summary Tour

- **Navigation handling:**
  - Use `Router.navigate()` with queryParams to signal tour continuation
  - Check for `?continueTour=true` or similar flag

### Demo Mode Integration
- **Guard against non-demo routes:**
  - Always check `demoService.isInDemoMode()` before starting tours
  - Fail silently if tours attempted outside demo mode

- **Demo restrictions notice:**
  - Tours highlight disabled features
  - Explain why actions are restricted
  - Encourage account creation

---

## Style Guide

### Tour Step Content Style
- **Titles:** Short, descriptive (3-5 words)
- **Descriptions:** Concise, friendly, 1-2 sentences
- **Tone:** Helpful, encouraging, not condescending
- **CTA:** Clear next actions

### Button Labels
- **Primary progression:** "Next", "Continue", "Got it"
- **Navigation:** "Go to [Section]"
- **Completion:** "Finish Tour", "Done"
- **Opt-out:** "Skip Tour", "Skip"
- **Return:** "Back", "Previous"

### Visual Design
- **Colors:** Match Angular Material theme
- **Arrows:** Use Shepherd's default arrow styling
- **Overlay:** Semi-transparent backdrop when highlighting
- **Transitions:** Smooth animations (300ms)

---

## Success Metrics

### User Engagement
- **Tour completion rate:** Track % of users who complete Welcome Tour
- **Feature discovery:** Measure interaction with highlighted features
- **Demo-to-signup conversion:** Track conversions from demo mode

### Technical Performance
- **Load time impact:** Minimal increase (<50ms)
- **Bundle size:** Keep Shepherd chunk under 50KB
- **No UI jank:** Smooth transitions and highlighting

---

## Future Enhancements

### Potential Additions (Post-MVP)
- **Progress indicator:** Show "Step 3 of 5" in tour UI
- **Tour menu:** Dedicated page listing all available tours
- **Interactive tutorials:** Allow users to perform actions during tour (with rollback)
- **Video integration:** Embed short videos in tour steps
- **Contextual tips:** Show one-time tooltips for specific actions
- **Localization:** Multi-language support for tours

---

## Status Tracking

**Current Phase:** Tour Restart Functionality (Complete!)
**Last Updated:** 2025-10-15
**Completed TODOs:** 14 / 37

### Completion Log

**Phase 1: Tour Service Foundation** ✅ COMPLETE
- ✅ TODO 1.1: Created `tour.service.ts` with full Shepherd integration
- ✅ TODO 1.2: Implemented localStorage tour state management (isTourCompleted, markTourCompleted, resetAllTours)
- ✅ TODO 1.3: Configured default Shepherd options with modal overlay and Material-compatible settings
- ✅ TODO 1.4: Created TourConfig and TourStep TypeScript interfaces

**Phase 2: Welcome Tour Implementation** ✅ COMPLETE
- ✅ TODO 2.1: Defined Welcome Tour with 5 steps in TourService
- ✅ TODO 2.2: Implemented `startWelcomeTour()` method with navigation to Expenses Tour
- ✅ TODO 2.3: Integrated tour into GroupsComponent with ngAfterViewInit hook
- ✅ TODO 2.3.1: Added data-tour attributes to groups.component.html

**Phase 6: Styling** ✅ COMPLETE (Moved up in priority)
- ✅ TODO 6.1: Created custom Shepherd theme CSS (`shepherd-theme.scss`) matching Material design
- ✅ TODO 6.2: Added Shepherd CSS and custom theme to angular.json
- ✅ TODO 6.3: Added responsive behavior in shepherd-theme.scss

**Additional Tours in TourService** ✅ PRE-BUILT
- ✅ Pre-implemented all 5 tours in TourService:
  - Welcome Tour (5 steps)
  - Expenses Tour (5 steps)
  - Summary Tour (3 steps)
  - History Tour (2 steps)
  - Memorized Tour (2 steps)

**TypeScript Type Fixes** ✅ COMPLETE
- ✅ Fixed TypeScript compilation errors:
  - Changed `Tour.TourOptions` to `TourOptions` (imported as separate type)
  - Fixed button action context from `Step` to `Tour` (correct binding)
  - Removed unused imports (`Shepherd` and `Step`)
  - Verified build succeeds with Shepherd.js lazy-loaded (54.95 kB chunk)

**Phase 2.5: Categories Tour Implementation** ✅ COMPLETE
- ✅ Added Categories Tour to TourService (5 steps):
  - Categories intro (table highlight)
  - Search categories feature
  - Filter active/inactive toggle
  - Add category button (demo restriction)
  - Navigation to Expenses tour
- ✅ Added data-tour attributes to categories.component.html:
  - `data-tour="categories-table"` on table container
  - `data-tour="category-search"` on search field
  - `data-tour="category-filter"` on active toggle
  - `data-tour="add-category-button"` on add button
- ✅ Integrated tour into CategoriesComponent:
  - Added TourService injection
  - Implemented AfterViewInit lifecycle hook
  - Called `checkForContinueTour('categories')` in ngAfterViewInit
- ✅ Updated `checkForContinueTour` to accept 'categories' as valid tour name
- ✅ Updated Welcome Tour final step to navigate to Categories (user modification)
- ✅ Build verification passed

**Phase 7.2: Tour Restart Functionality** ✅ COMPLETE
- ✅ Added "Show Tour" icon button to GroupsComponent:
  - Material "tour" icon next to help icon
  - Only visible in demo mode
  - Calls `startWelcomeTour(true)` to force restart
- ✅ Added "Show Tour" icon button to CategoriesComponent:
  - Material "tour" icon next to help icon
  - Only visible in demo mode
  - Calls `startCategoriesTour(true)` to force restart
- ✅ Implemented `startTour()` methods in both components
- ✅ Tours can now be restarted anytime by clicking the tour icon
- ✅ Build verification passed

**Phase 2.6: Members Tour Implementation** ✅ COMPLETE
- ✅ Added Members Tour to TourService (5 steps)
- ✅ Added data-tour attributes to members.component.html
- ✅ Integrated tour into MembersComponent with AfterViewInit
- ✅ Updated `checkForContinueTour` to accept 'members'
- ✅ Added tour restart button to members component
- ✅ Build verification passed

**Phase 3: Expenses Tour Implementation** ✅ COMPLETE
- ✅ Added Expenses Tour to TourService (5 steps)
- ✅ Added data-tour attributes to expenses.component.html
- ✅ Integrated tour into ExpensesComponent with AfterViewInit
- ✅ Updated `checkForContinueTour` to accept 'expenses'
- ✅ Added tour restart button to expenses component
- ✅ Updated final step to navigate to Add Expense (user requirement)
- ✅ Build verification passed

**Phase 3.5: Add Expense Tour Implementation** ✅ COMPLETE
- ✅ Created `startAddExpenseTour()` method in TourService (5 steps):
  - Basic info form section
  - Amount fields (total and proportional)
  - Split controls (equal/custom splits)
  - Demo mode reminder
  - Navigation to Memorized tour
- ✅ Added data-tour attributes to add-expense.component.html:
  - `data-tour="basic-info"` on payer/date/description/category section
  - `data-tour="amount-fields"` on amount fields
  - `data-tour="split-controls"` on split buttons
- ✅ Integrated tour into AddExpenseComponent:
  - Injected TourService
  - Implemented AfterViewInit lifecycle hook
  - Added `ngAfterViewInit()` method calling `checkForContinueTour('add-expense')`
  - Added `startTour()` method to manually restart tour
  - Added tour restart button in header (only visible in demo mode)
- ✅ Updated `checkForContinueTour` to accept 'add-expense'
- ✅ Build verification passed

**Phase 5.2: Memorized Expenses Tour Implementation** ✅ COMPLETE
- ✅ Added Memorized Tour to TourService (3 steps):
  - Memorized expenses intro with table highlight
  - Search functionality
  - Navigation to Summary tour (updated per user requirement)
- ✅ Added data-tour attributes to memorized.component.html:
  - `data-tour="memorized-table"` on table element
  - `data-tour="memorized-search"` on search field
  - `data-tour="memorize-button"` on "Memorize New Expense" button
- ✅ Integrated tour into MemorizedComponent:
  - Added AfterViewInit import
  - Added TourService import and injection
  - Changed component to implement AfterViewInit
  - Added `ngAfterViewInit()` method calling `checkForContinueTour('memorized')`
  - Added `startTour()` method calling `startMemorizedTour(true)`
  - Added tour restart button in header (only visible in demo mode)
- ✅ Updated `checkForContinueTour` to accept 'memorized'
- ✅ Build verification passed

**Phase 4: Summary Tour Implementation** ✅ COMPLETE
- ✅ Summary Tour already exists in TourService (3 steps)
- ✅ Data-tour attribute already present in summary.component.html (`data-tour="payment-flow"`)
- ✅ Tour already integrated into SummaryComponent (AfterViewInit, TourService injection)
- ✅ Tour restart button already present in summary component
- ✅ Verification: Summary tour was already complete from earlier work

**Phase 5.1: History Tour Implementation** ✅ COMPLETE
- ✅ History Tour already existed in TourService (2 steps):
  - History intro
  - Historical payments table
- ✅ Updated History Tour to reference correct data-tour attribute (`[data-tour="history-table"]`)
- ✅ Added data-tour attributes to history.component.html:
  - `data-tour="history-filters"` on filters container
  - `data-tour="history-table"` on table element
- ✅ Integrated tour into HistoryComponent:
  - Added AfterViewInit import
  - Added TourService import and injection
  - Changed component to implement AfterViewInit
  - Added `ngAfterViewInit()` method calling `checkForContinueTour('history')`
  - Added `startTour()` method calling `startHistoryTour(true)`
  - Added tour restart button in header (only visible in demo mode)
- ✅ Updated `checkForContinueTour` to accept 'history' in type signature
- ✅ Added 'history' case to checkForContinueTour switch statement
- ✅ Build verification passed

**Tour Flow (Updated per User Requirements):**
Groups → Members → Categories → Expenses → **Add New Expense** → Memorized → **Summary**
(History tour is manual-only, no auto-navigation)

**Status: ALL TOURS COMPLETE!** 🎉

The complete tour system is now fully implemented with the following tours:
1. ✅ Groups (Welcome Tour) - 5 steps
2. ✅ Members Tour - 5 steps
3. ✅ Categories Tour - 5 steps
4. ✅ Expenses Tour - 5 steps
5. ✅ Add New Expense Tour - 5 steps
6. ✅ Memorized Tour - 3 steps
7. ✅ Summary Tour - 3 steps
8. ✅ History Tour - 2 steps (manual-only)

**Next Steps:**
- Test complete tour flow end-to-end in demo mode
- Verify all tour transitions work correctly
- Consider user feedback for tour improvements

---

## Notes and Decisions

### Decision Log
1. **Shepherd.js vs. alternatives:** Chose Shepherd for Floating UI integration and Material compatibility
2. **Centralized service vs. component-level:** Service pattern chosen for consistency and reusability
3. **Auto-start strategy:** Only Welcome Tour auto-starts; others require continuation or manual trigger
4. **localStorage vs. session storage:** localStorage chosen for cross-session persistence

### Known Limitations
- Tours depend on stable DOM structure; major UI changes may break selectors
- Mobile experience may be limited on very small screens (<400px)
- Tours only available in demo mode (by design)

---

## Resources

- **Shepherd.js Documentation:** https://shepherdjs.dev/
- **Shepherd.js GitHub:** https://github.com/shipshapecode/shepherd
- **Angular Integration Examples:** (to be added as we implement)
- **Floating UI Docs:** https://floating-ui.com/

---

*This document serves as a checkpoint for implementation progress. Update after each TODO completion to maintain conversation continuity.*
