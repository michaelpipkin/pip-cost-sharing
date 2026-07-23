# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

- [Vacation Rental Split](#vacation-rental-split)

---

## Vacation Rental Split

### The problem

When a group shares a vacation rental (Vrbo/AirBnB), it's common for not everyone to stay the full duration. For example, a group of 5 people rents a condo for 4 nights, but only 3 people stay the first night and only 4 stay the last night. Figuring out who owes what by hand is tedious and error-prone — today the app's "split by shares" option requires the user to work out the share math themselves before entering anything.

### The math (fixed pool of nights × people, with partial shares)

Each night of the rental costs the same amount (`total / nights`) and should be split equally among whoever stayed that night — so a night with fewer people staying costs each of them more, and a night with everyone present costs each of them less.

- `N` = number of nights, `P` = number of participants (people ever staying at least one night). Total share pool = `N × P` ("people-nights").
- Each night distributes `P` shares evenly among that night's occupants: a member present on night `n` earns `P / occ_n` shares for that night, where `occ_n` is the number of people staying that night. (Every night therefore contributes exactly `P` shares to the pool — an equal `1/N` of the total — which is what makes each night cost the same overall, matching the even nightly cost.)
- A member's total shares = the sum, over all nights they stayed, of `P / occ_n`.
- These per-member share totals are handed to the app's existing "split by shares" calculation, which converts shares → percentage → currency amounts (with cent-level rounding reconciliation), so the final dollar amounts are exact.

**Worked example:** 5 people rent a condo for 4 nights. Night 1: 3 people stay. Nights 2 & 3: all 5 stay. Night 4: 4 people stay.
- Pool = `P × N` = 5 × 4 = 20 shares total.
- Night 1 (3 people): each of those 3 gets `5 / 3 ≈ 1.67` shares.
- Nights 2 & 3 (5 people each): each of the 5 gets `5 / 5 = 1` share per night (2 shares across both nights).
- Night 4 (4 people): each of those 4 gets `5 / 4 = 1.25` shares.
- A member who stayed all 4 nights (and was one of the 4 present on night 4) totals `1.67 + 1 + 1 + 1.25 ≈ 4.92` shares. The 20-share pool splits the total cost proportionally to these per-member share totals.

(An earlier version of this idea used the LCM of the distinct nightly occupancies — e.g. `LCM(3,4,5) = 60` shares/night — to keep all share counts as whole numbers. That approach produces the same dollar amounts but can generate very large, unintuitive share counts when nightly occupancy varies a lot. The fixed nights × people pool with partial shares was chosen instead because it keeps share numbers small and bounded, and the shares field already supports partial/decimal values.)

### Confirmed design decisions

1. **Entry point** — a dedicated "Vacation Rental" wizard, launched from a new button on the expenses page, collects the rental total, number of nights, and per-night occupancy (who stayed which nights), then computes each member's shares and hands off to the existing add-expense page (prefilled as a `shares` split) for final review (payer, category, receipt) and save. The wizard does not duplicate that UI.
2. **Editability** — the per-night occupancy grid is persisted on the expense (not just the resulting share numbers), so a saved rental expense can be reopened later and its occupancy grid adjusted (e.g., someone joins the trip after the fact), recomputing shares and amounts.
3. **Persisted split type** — the computed allocation is saved as a normal `shares` split; no new `SplitMethod` is introduced. The wizard is purely an input aid that produces share counts for the existing shares-splitting machinery.
4. Group membership in the wizard/grid is adjustable (add/remove participants), mirroring the existing add-expense split-row UX, since not everyone in a group necessarily goes on a given trip.
5. Memorized expenses are out of scope, since vacation rentals are inherently date/occupancy-specific and don't fit the memorized-expense reuse model well.

### Implementation outline

See the implementation plan for full detail (data model, new `RentalUtilsService`, occupancy-grid component, routing, add/edit-expense wiring, help content, and tour updates). In short:

- Add an optional `rental: RentalDetails | null` field to the `Expense` model (`{ nightCount, stays: [{ memberRef, nights: number[] }] }`), stored as an array of per-member objects (not a nested array matrix, per Firestore's no-nested-arrays constraint).
- Add a `RentalUtilsService` with a pure `computeShares()` function implementing the math above.
- Add a reusable occupancy-grid component (members × nights checkboxes, with a live per-member dollar preview) used both by the add-flow wizard and as an edit-flow dialog.
- Reuse `AllocationUtilsService.allocateByShares()` for the actual shares → currency conversion; no new allocation logic.

