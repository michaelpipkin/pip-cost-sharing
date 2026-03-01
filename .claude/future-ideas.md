# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

1. [Payment Notification Emails](#payment-notification-emails)

---

## Payment Notification Emails

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

Use the **Firebase Trigger Email extension** (formerly "Send Email") backed by a transactional email provider (SendGrid, Mailgun, Postmark, etc.). The extension watches a Firestore collection (e.g., `mail`) and sends emails from documents written there. This keeps the sending logic simple: just write a document to `mail` and the extension handles the rest.

Alternatively, a Cloud Function could call the provider's SDK directly if more control is needed (e.g., templating, custom headers).

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

1. **Set up email delivery** — Choose a provider, install/configure the Trigger Email extension or set up the SDK in `functions/`.
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

