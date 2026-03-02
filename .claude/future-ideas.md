# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

1. [Payment Notification Emails](#payment-notification-emails) ✅ *implemented — pending production validation*
2. [Admin Module Expansion](#admin-module-expansion) ✅ *implemented — pending production validation*
3. [Account Page Redesign](#account-page-redesign)

---

## Payment Notification Emails

> **Status: ✅ Implemented — pending production validation.**
> Implementation complete as of March 2026. Emulator-tested. Awaiting first production deploy to confirm end-to-end email delivery.

### Motivation

When one member marks debts as paid in PipSplit, the other party has no way of knowing unless they happen to open the app. An email notification would close the loop: it confirms the PipSplit record has been updated, reminds the recipient to expect a real money transfer from their P2P payment provider, and generally makes the workflow feel complete.

Two distinct triggers exist:
- **Member-to-member payment** — one member marks the outstanding balance between themselves and one other member as paid (`paySplitsBetweenMembers()`).
- **Group settle** — a group admin runs the settle function, which resolves all outstanding balances across the entire group in one shot (`settleGroup()`).

---

### Relevant Existing Code

| Layer | File | Key Symbol |
|---|---|---|
| Summary component | `src/app/components/summary/summary/summary.component.ts` | `payExpenses()`, `settleGroupAction()` |
| Split service | `src/app/services/split.service.ts` | `paySplitsBetweenMembers()`, `settleGroup()` |
| User service | `src/app/services/user.service.ts` | `getPaymentMethods()` |
| History model | `src/app/models/history.ts` | `History` interface |
| Member model | `src/app/models/member.ts` | `Member.email`, `Member.userRef` |
| User model | `src/app/models/user.ts` | `User.email` |
| Cloud Functions | `functions/src/index.ts` | all existing functions |

**History document shape (written on each payment/settle):**
```
groups/{groupId}/history/{historyId}
  date: string          (ISO)
  paidByMemberRef: DocumentReference<Member>
  paidToMemberRef: DocumentReference<Member>
  totalPaid: number
  splitsPaid: DocumentReference<Split>[] | null
    — array of split refs for member-to-member payments
    — empty array [] for group settle transfers
```

Member documents carry an `email` field directly, which avoids needing a secondary lookup in most cases.

---

### Proposed Approach

#### Email delivery

**Status: already configured.** The Firebase Trigger Email from Firestore extension is installed and confirmed working in production, using pipsplit.com SMTP settings. The extension watches the `mail` Firestore collection and sends emails from documents written there. Writing a document to `mail` is all that is needed — the extension handles delivery.

#### Trigger mechanism

Two options:

**Option A — Firestore `onCreate` trigger on `history` collection**
- A Cloud Function listens on `groups/{groupId}/history/{historyId}`.
- On each new document it determines whether this is a member payment or a group settle transfer, looks up member emails, and writes to `mail`.
- Pro: no Angular-side changes needed beyond what already exists.
- Con: the trigger fires for *every* history document, including those created by undo/unpay operations if those ever write history entries. Needs care.

**Option B — Dedicated `onCall` functions (`sendPaymentNotification`, `sendSettleNotification`)**
- Summary component calls the function after `paySplitsBetweenMembers()` / `settleGroup()` succeeds.
- Pro: explicit control; easy to pass pre-resolved data (member names, payment methods used, amounts) without re-fetching in the function.
- Con: requires Angular-side changes and means the email is not sent if the client disconnects before calling the function.

Option A is cleaner architecturally. The history document written by `settleGroup()` uses an empty `splitsPaid: []` while member-to-member writes an array, so the trigger can distinguish the two cases.

---

### Member-to-Member Payment Email

**Recipients:** both the payer (`paidByMemberRef`) and the payee (`paidToMemberRef`).

**Email to the payer (the one who recorded the payment):**
> Subject: You marked a payment as complete in PipSplit
>
> Hi [PayerName],
>
> You've recorded a payment of [amount] to [PayeeName] in the group "[GroupName]".
>
> If you haven't already sent the money, [PayeeName] is set up on:
> - Venmo: @venmoId
> - PayPal: paypalId
> - Cash App: $cashAppId
> - Zelle: zelleId  *(only list the IDs that exist)*
>
> This payment covers [N] shared expense(s) from [earliest date] to [latest date].

**Email to the payee (the one receiving the money):**
> Subject: [PayerName] has marked a payment to you as complete in PipSplit
>
> Hi [PayeeName],
>
> [PayerName] has recorded a payment of [amount] to you in the group "[GroupName]".
>
> Please be on the lookout for [amount] from [PayerName] via your P2P payment provider.
>
> This payment covers [N] shared expense(s).

**Data needed in the Cloud Function:**
- `paidByMemberRef` → Member → `displayName`, `email`
- `paidToMemberRef` → Member → `displayName`, `email`, `userRef` → User → payment method IDs
- `totalPaid`
- `splitsPaid.length` (number of expenses covered, or count of splits)
- Group name — available from the `groupId` path parameter

---

### Group Settle Email

When `settleGroup()` runs it creates one history document per transfer pair. A single "settle" action could therefore trigger several emails. Two strategies:

**Option 1 — One email per history document (one per transfer)**
Simple but could result in multiple emails to the same person if they're involved in more than one transfer.

**Option 2 — Aggregate into one email per member**
Collect all transfers in the batch, group by member, and send one summary email per involved member listing all their transfers. Requires either:
- A batch ID written into each history document so the trigger can group them, or
- An `onCall` function that receives the full transfer list.

Option 2 is better UX. A `batchId` field (a UUID generated client-side before the batch write) on each history document would let the trigger accumulate all related documents before sending.

**Email to each member (summarizing their role in the settlement):**
> Subject: Group "[GroupName]" has been settled in PipSplit
>
> Hi [MemberName],
>
> A group settlement has been recorded for "[GroupName]".
>
> Your transfers:
> - You owe [Amount] to [OtherMember] — look for them on Venmo (@id), PayPal (id), ...
>   *(or)*
> - [OtherMember] owes you [Amount] — be on the lookout for this payment.
>
> All outstanding balances in the group have been marked as settled in PipSplit.

---

### Data / Schema Changes Needed

| Change | Reason |
|---|---|
| Add optional `batchId: string` to History Firestore document | Lets the trigger group settle transfers together for aggregate emails |
| Write `batchId` in `splitService.settleGroup()` before the batch commit | Generates a UUID and stamps all history docs in the settle batch |

No changes to the Member or User models are needed — emails are already on Member documents.

---

### Implementation Steps (rough order)

1. **Email delivery is already configured** — The Trigger Email from Firestore extension is installed and working. Skip this step.
2. **Add `batchId` to History model and `settleGroup()` write** — Small model change + UUID generation in the service.
3. **Write `sendPaymentNotificationEmail` Cloud Function** — `onCreate` trigger on `groups/{groupId}/history/{historyId}`. Detect payment vs. settle via `splitsPaid` field. For payments, resolve members and write two `mail` documents immediately. For settle, queue or accumulate using `batchId`.
4. **Handle settle aggregation** — Either use a short Cloud Task delay to collect all docs with the same `batchId`, or use a `onCall` approach for settle specifically.
5. **Template the emails** — Simple text first; HTML template later if desired.
6. **Member opt-out preference** — Consider adding an `emailNotifications: boolean` field to the User model so members can opt out.

---

### Open Questions

- Which transactional email provider to use? (SendGrid is popular with Firebase; Postmark has excellent deliverability.)
- Should the payer email be optional? Some users may find it redundant since they initiated the action.
- Should emails be opt-in or opt-out? Default opt-out is safer for onboarding but reduces the feature's value.
- For group settle aggregation: Cloud Task delay vs. `onCall` from Angular?
- Should group admins receive a separate summary email when someone else in the group settles?

---

## Admin Module Expansion

> **Status: ✅ Implemented — pending production validation.**
> Implementation complete as of March 2026. Includes `AdminShellComponent` with `MatTabNav`, `AdminEmailLogComponent`, `AdminMailService`, and `MailDocument`/`MailDelivery`/`MailDeliveryInfo` models.

### Motivation

The current admin entry point is a button buried on the Account tab that navigates to a single statistics page. As admin functionality grows, these pages need a proper home with their own navigation shell rather than being accessed one at a time from the account page.

Two immediate pages are planned: the existing Statistics page and a new Email Delivery Log page that surfaces delivery status from the `mail` Firestore collection. The latter is made possible by the Trigger Email extension, which writes delivery state (including errors) back into each `mail` document after attempting to send.

---

### Relevant Existing Code

| Layer | File | Key Symbol |
|---|---|---|
| Admin statistics component | `src/app/components/admin/statistics/statistics.component.ts` | `AdminStatisticsComponent` |
| Admin routes | `src/app/components/admin/admin.routes.ts` | `adminRoutes` |
| Admin guard | `src/app/components/auth/guards.guard.ts` | `adminGuard` |
| Account component | `src/app/components/auth/account/account.component.ts` | admin button linking to `/admin/statistics` |
| App routes | `src/app/app.routes.ts` | `/admin` parent route with `canActivate: [authGuard, adminGuard]` |

---

### Proposed Architecture — Admin Shell

Create `AdminShellComponent` as a layout wrapper containing:
- A `MatTabNav` (horizontal tab bar with `MatTabLink` router links) at the top for each admin page — Statistics, Email Log, and any future pages.
- A `<router-outlet>` below for the active page.

`MatTabNav` scrolls horizontally on small screens so it works naturally across all device sizes without any breakpoint logic.

The existing `adminGuard` on the `/admin` parent route continues to protect everything underneath. Changes needed:
- `admin.routes.ts` — add `AdminShellComponent` as the layout, default redirect to `statistics`, and a new `email-log` child route.
- Account page admin button — link to `/admin` (the shell) instead of `/admin/statistics` directly.

---

### Email Delivery Log Page

New `AdminEmailLogComponent` at `/admin/email-log`. Reads documents from the `mail` Firestore collection (top-level collection, not a subcollection). The Trigger Email extension writes delivery status back into each document under a `delivery` field after processing.

**`mail` document shape (Trigger Email extension):**
```
mail/{docId}
  to: string | string[]
  message:
    subject: string
    text?: string
  delivery:
    state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'RETRY'
    attempts: number
    startTime: Timestamp
    endTime?: Timestamp
    error?: string
    info?:
      messageId: string
      accepted: string[]
      rejected: string[]
      response: string
```

**Page features:**
- Table of `mail` documents ordered by `delivery.startTime` descending (most recent first).
- Columns: Date/Time, Recipient, Subject, State (color-coded chip), Attempts, Error (truncated).
- State filter chips at the top: All | Pending | Processing | Success | Error | Retry.
- Expandable row (or detail panel) showing full error text and delivery info.

---

### Model / Schema Additions

| Addition | Location | Purpose |
|---|---|---|
| `MailDeliveryInfo` interface | `src/app/models/mail.ts` | `delivery.info` shape |
| `MailDelivery` interface | `src/app/models/mail.ts` | Full `delivery` field shape |
| `MailDocument` interface | `src/app/models/mail.ts` | Top-level `mail` document shape |

No Firestore schema changes needed — the extension defines the shape.

---

### Implementation Steps (rough order)

1. **Create `AdminShellComponent`** with `MatTabNav` tab bar and `<router-outlet>`.
2. **Update `admin.routes.ts`** — add shell as layout component, default redirect to `statistics`, add `email-log` child route.
3. **Update Account page admin button** to link to `/admin` instead of `/admin/statistics`.
4. **Define `MailDocument` / `MailDelivery` / `MailDeliveryInfo` interfaces** in `src/app/models/mail.ts`.
5. **Create `AdminMailService`** with a `getMailDocuments(limit)` method querying the `mail` collection.
6. **Build `AdminEmailLogComponent`** — table with state filter chips.

---

## Account Page Redesign

### Motivation

The current account page uses three sparse `MatTabGroup` tabs:
- **Account** — email verify/update, password change, delete account, admin link.
- **Payment Services** — four P2P payment IDs.
- **Receipt Policy** — policy text and acceptance checkbox.

Each tab has relatively little content, making the page feel thin and disconnected. As the app grows (notification preferences, language settings, more legal policies), a layout with clearly separated sections scales better and matches the UX patterns users expect from account/settings pages.

**Responsive design is a primary constraint.** The current tab layout works well on all screen sizes. Any redesign must preserve full mobile compatibility.

---

### Proposed Layout — Responsive Sidebar Navigation

**Desktop (≥ 768px): side-by-side layout**
```
┌──────────────────────────────────────────────────┐
│  Account Settings                                │
├──────────────────┬───────────────────────────────┤
│  > Profile       │  [Selected section content]   │
│    Security      │                               │
│    Payments      │                               │
│    Preferences   │                               │
│    Legal         │                               │
└──────────────────┴───────────────────────────────┘
```

**Mobile (< 768px): master-detail navigation**
```
List view (no section active)        Section view (section active)
┌──────────────────────────┐         ┌──────────────────────────┐
│  Account Settings        │         │ ← Account Settings       │
├──────────────────────────┤         ├──────────────────────────┤
│  Profile               > │  tap    │                          │
│  Security              > │ ──────► │  [Section content]       │
│  Payments              > │         │                          │
│  Preferences           > │         │                          │
│  Legal                 > │         │                          │
└──────────────────────────┘         └──────────────────────────┘
```

On mobile the user sees the section list; tapping a row navigates into that section with a back button to return to the list. This is the same pattern used in iOS/Android settings apps and modern mobile web settings pages (e.g., Google Account on mobile).

---

### Responsive Implementation Strategy

**Preferred approach: router-based child routes + `BreakpointObserver`**

Each section gets its own child route (e.g., `/auth/account/security`, `/auth/account/payments`). Angular CDK `BreakpointObserver` (already available in the project) detects the screen size and drives a `isMobile` signal:

- **Desktop**: `AccountComponent` renders a split-pane — sidebar `MatNavList` on the left + `<router-outlet>` on the right. Both panels are visible simultaneously. Navigating to `/auth/account` redirects to the default section (Profile).
- **Mobile**: `AccountComponent` shows *either* the sidebar list *or* the router-outlet content. When no child route is active, show the section list. When a child route is active, show that section with a back arrow in the toolbar. `isMobile` controls which panel is visible.

The same child route components render in both desktop and mobile contexts — `BreakpointObserver` only controls layout visibility. Deep-linking to any section is a free side-effect.

---

### Proposed Sections

| Section | Content |
|---|---|
| **Profile** | Account type indicator (Google vs. email/password), email address (display for Google users), linked account status |
| **Security** | Email verify/update (non-Google only), password change (non-Google only), delete account |
| **Payments** | Venmo, PayPal, CashApp, Zelle IDs — same as current Payment Services tab |
| **Preferences** | Default group selector (`User.defaultGroupRef` — already on the model), language, notification opt-in/out (stub now; populate when email notifications are implemented) |
| **Legal** | Receipt policy acceptance — same as current Receipt Policy tab |

---

### Implementation Steps (rough order)

1. **Add child routes** to `src/app/components/auth/auth.routes.ts` for each account section, plus a default redirect from `/auth/account` to `/auth/account/profile`.
2. **Extract section child components** — `AccountProfileComponent`, `AccountSecurityComponent`, `AccountPaymentsComponent`, `AccountPreferencesComponent`, `AccountLegalComponent` — by pulling the relevant form logic out of `AccountComponent`.
3. **Refactor `AccountComponent`** into a layout shell: sidebar `MatNavList` + `<router-outlet>`.
4. **Add `BreakpointObserver` signal** (`isMobile`) and wire template to show/hide sidebar vs. outlet.
5. **Add mobile back-navigation** — show back arrow when a child route is active on mobile; clicking it navigates to `/auth/account` (the list view).
6. **Update styles** in `styles.scss` — split-pane layout, sidebar width, responsive breakpoint transitions.

---

### Open Questions

- Should "Profile" surface a display name? The `User` model has no `displayName` — it lives on `Member` records (one per group). Worth deciding what to show for identity beyond email address.
- Should the admin link become its own sidebar section entry visible only to the admin user, or remain a button within the Security section?
- Should notification preferences be added as a stub/placeholder now (to anticipate the email notification feature) or only introduced when that feature is actually implemented?
