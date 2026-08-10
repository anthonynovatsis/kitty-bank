# Bank Account Management System - Implementation Plan

## Overview

This document outlines the plan to add bank account management functionality to Kitty Bank, supporting both traditional cash accounts and investment accounts with equity holdings.

## Account Structure

### Account Types

1. **Cash Account** - Traditional savings/checking accounts
   - Simple balance tracking
   - Deposit/withdrawal transactions
   - Standalone accounts

2. **Investment Account** - Securities trading accounts
   - Holds equity positions (stocks, shares)
   - Standalone: no linked cash settlement account (see Phase 3)
   - Supports buy/sell transactions with cost basis tracking

### Account Relationships

- **Standalone Cash Account:**
  - Simple banking account for deposits/withdrawals

- **Investment Account:**
  - Holds securities positions in holdings table
  - Portfolio value calculated from current market prices
  - Supports dividend reinvestment (DRIP) functionality

## Database Schema

### Domain-Specific Tables

#### `cash_accounts`
```sql
- id: text PRIMARY KEY
- user_id: text (FK to users.id)
- account_name: text
- balance: decimal
- status: 'active' | 'closed'
- created_at: timestamp
- updated_at: timestamp
```

#### `investment_accounts`
```sql
- id: text PRIMARY KEY
- user_id: text (FK to users.id)
- account_name: text
- status: 'active' | 'closed'
- created_at: timestamp
- updated_at: timestamp
```

#### `holdings` (maintained cache - updated from transactions)
```sql
- id: text PRIMARY KEY
- investment_account_id: text (FK to investment_accounts.id)
- symbol: text
- company_name: text
- quantity: integer (current total whole shares/units)
- total_cost_basis: integer cents (cost of the whole position; average derived)
- dividend_reinvestment: boolean
- dividend_cash_balance: decimal (fractional cash carried forward for DRIP)
- last_transaction_date: timestamp
- created_at: timestamp
- updated_at: timestamp
```

#### `investment_transactions`
```sql
- id: text PRIMARY KEY
- investment_account_id: text (FK to investment_accounts.id)
- transaction_type: 'buy' | 'sell' | 'dividend_reinvest' | 'split'
- symbol: text
- quantity: decimal (shares/units, nullable for some splits)
- price: decimal (per share/unit, nullable for splits)
- amount: decimal (total transaction value)
- brokerage: decimal (transaction fees)
- description: text (optional notes/reason for transaction)
- transaction_date: timestamp
- status: 'pending' | 'approved' | 'rejected' | 'executed'
- created_by_user_id: text (FK to users.id)
- approved_by_admin_id: text (FK to users.id, nullable)
- created_at: timestamp
- approved_at: timestamp (nullable)
```

#### `cash_transactions`
```sql
- id: text PRIMARY KEY
- cash_account_id: text (FK to cash_accounts.id)
- transaction_type: 'deposit' | 'withdrawal' | 'transfer' | 'interest' | 'fee'
- amount: decimal
- description: text
- from_account_id: text (FK to cash_accounts.id, nullable for transfers)
- to_account_id: text (FK to cash_accounts.id, nullable for transfers)
- status: 'pending' | 'approved' | 'rejected' | 'completed'
- created_by_user_id: text (FK to users.id)
- approved_by_admin_id: text (FK to users.id, nullable)
- created_at: timestamp
- approved_at: timestamp (nullable)
```

#### `user_settings`
```sql
- id: text PRIMARY KEY
- user_id: text (FK to users.id)
- requires_transaction_approval: boolean (default true)
- is_admin: boolean (default false)
- created_at: timestamp
- updated_at: timestamp
```


## API Routes (tRPC)

### Admin Routes

#### Account Management
- `admin.accounts.list` - List all accounts with filters (user, type, status)
- `admin.accounts.create` - Create new account for user
- `admin.accounts.update` - Update account details/status
- `admin.accounts.close` - Close/suspend account
- `admin.accounts.getDetails` - Get account details with holdings

#### Transaction Management
- `admin.transactions.pending` - List pending transactions (cash + investment)
- `admin.transactions.approve` - Approve/reject transactions
- `admin.transactions.list` - Transaction history with filters
- `admin.holdings.adjust` - Manual holdings adjustments (splits, etc.)

#### User Management
- `admin.users.list` - List users with account summaries
- `admin.users.getAccounts` - Get all accounts for specific user
- `admin.users.updateApprovalSettings` - Set requires_transaction_approval for user

### User Routes

#### Account Access
- `user.accounts.list` - Get current user's accounts
- `user.accounts.getDetails` - Get account details with current holdings
- `user.accounts.getBalance` - Get account balances

#### Cash Transactions
- `user.cash.deposit` - Submit deposit request
- `user.cash.withdraw` - Submit withdrawal request
- `user.cash.transfer` - Transfer between own accounts
- `user.cash.getTransactions` - Get cash transaction history

#### Investment Transactions
- `user.investments.buy` - Submit buy order
- `user.investments.sell` - Submit sell order
- `user.investments.getHoldings` - Get current holdings with market values
- `user.investments.getTransactions` - Get investment transaction history (all or by symbol)
- `user.investments.getHoldingDetail` - Get specific holding with its transaction history
- `user.investments.updateDRIP` - Toggle dividend reinvestment

## User Interface

### Admin Interface

#### `/admin/accounts` - Account Management Dashboard
- Search and filter accounts by user, type, status
- Create new accounts (with user lookup)
- Account details with holdings overview
- Bulk operations (status changes, etc.)

#### `/admin/transactions` - Transaction Approval Queue
- Pending transactions list (cash + investment) filtered by supervised users
- Quick approve/reject actions
- Transaction details modal
- Batch processing capabilities
- User approval settings management

#### `/admin/users` - User Account Overview
- User search with account summaries
- Account creation wizard
- User portfolio overview

#### `/admin/holdings` - Portfolio Management
- System-wide holdings overview
- Manual adjustments for corporate actions
- Holdings reconciliation tools

### User Interface

#### Enhanced Dashboard
- Account overview cards showing:
  - Cash accounts: Current balance, recent transactions
  - Investment accounts: Portfolio value, day's change, top holdings

#### `/dashboard/accounts/[id]` - Account Detail Pages

**Cash Account View:**
- Current balance and available funds
- Transaction history table
- Quick deposit/withdrawal forms
- Transfer between accounts

**Investment Account View:**
- Portfolio overview (total value, day/total gains)
- Holdings table (symbol, quantity, cost basis, current value, gain/loss)
  - Click on any holding to see transaction detail
- Total portfolio value (calculated from current market prices)
- Buy/sell order forms
- Transaction history with realized gains
- DRIP settings toggle

#### `/dashboard/transactions` - Transaction Center
- Combined transaction history (cash + investment)
- Transaction status tracking
- Pending transaction alerts

## Transaction Workflows

### Cash Account Transactions

**Transaction Flow:**
1. User submits deposit/withdrawal/transfer
2. Check user's `requires_transaction_approval` setting
3. If approval required → Transaction created with 'pending' status
4. If auto-approved → Transaction created and immediately processed
5. For pending transactions: Admin reviews and approves/rejects
6. Upon approval, account balances updated and transaction marked 'completed'

### Investment Account Transactions

**Buy Order Flow:**
1. User submits buy order with symbol, quantity, price, amount, brokerage, transaction_date
2. Investment transaction created with all details
3. Check user's `requires_transaction_approval` setting:
   - If approval required → 'pending' status
   - If auto-approved → 'approved' status
4. Admin reviews pending transactions and approves/rejects
5. Upon approval:
   - Update/create holding record (quantity, avg cost basis)
   - Mark investment transaction 'executed'

**Sell Order Flow:**
1. User submits sell order with symbol, quantity, price, amount, brokerage, transaction_date
2. System validates sufficient quantity ownership from holdings table
3. Investment transaction created with all details
4. Check user's `requires_transaction_approval` setting:
   - If approval required → 'pending' status
   - If auto-approved → 'approved' status
5. Admin reviews pending transactions and approves/rejects
6. Upon approval:
   - Update holding record (reduce quantity, delete if zero)
   - Calculate realized gain/loss
   - Mark investment transaction 'executed'

**Dividend Processing (DRIP enabled):**
1. Calculate dividend amount for holding
2. Add to existing dividend_cash_balance in holdings
3. If total cash ≥ current share price:
   - Create dividend_reinvest transaction for whole shares purchasable
   - Update holding: add quantity, recalculate avg cost basis
   - Update dividend_cash_balance with remainder
4. If total cash < share price: Just update dividend_cash_balance

**Example:**
- Holding: 100 shares, dividend_cash_balance: $23.45
- New dividend: $42.00, total available: $65.45
- Share price: $31.20, can buy 2 shares ($62.40)
- Create transaction: quantity=2, price=$31.20, amount=$62.40
- Update holding: quantity=102, dividend_cash_balance=$3.05

### User-Level Transaction Approval

**Flexible Approval System:**
- **Trusted users:** Set `requires_transaction_approval: false` (auto-approved)
- **Supervised users:** Set `requires_transaction_approval: true` (needs admin approval)
- **Example use cases:**
  - Parent account: Auto-approved transactions
  - Child account: All transactions require parent/admin approval
  - New users: Require approval until they gain trust

## Implementation Phases

**Strategy: Vertical slices - complete each feature end-to-end before moving to next**

### Phase 1: Core Database & Models ✅
- [x] Add new database tables
- [x] Create Drizzle schema definitions  
- [x] Run database migration
- [x] Create TypeScript types

### Phase 2A: Account Management (Complete Slice) ✅
**Admin API:**
- [x] Admin authentication middleware (`adminProcedure` in `trpc.ts`)
- [x] `admin.accounts.create` - Create cash/investment accounts for users
- [x] `admin.accounts.list` - List all accounts with filters
- [x] `admin.accounts.update` - Update account name/status
- [x] `admin.users.search` - Search users for account creation combobox

**Admin Interface:**
- [x] Admin dashboard with account overview (cash/investment totals, net worth)
- [x] Account tabs (overview, cash, investment)
- [x] Create account dialog with user search combobox

**User Interface:**
- [x] Enhanced dashboard showing real user accounts and balance
- [x] Basic account detail pages

**Result:** Working account creation and viewing system

### Phase 2B: User Management (Complete Slice) ✅
**Admin API:**
- [x] `admin.users.list` - List all users with account summaries
- [x] `admin.users.updateApprovalSettings` - Set transaction approval requirements

**Admin Interface:**
- [x] Users tab in admin dashboard
- [x] Toggle user approval settings
- [x] User account overview (cash/investment account counts, balances, role)

**Result:** Working user administration system

### Phase 2C: Cash Transaction System (Complete Slice) ✅
**Admin API:**
- [x] `admin.transactions.pending` - List pending cash transactions  
- [x] `admin.transactions.approve` - Approve/reject cash transactions

**User API:**
- [x] `user.cash.deposit` - Submit deposit
- [x] `user.cash.withdraw` - Submit withdrawal
- [x] `user.cash.transfer` - Transfer between own accounts
- [x] `user.cash.getTransactions` - Cash transaction history

**User Interface:**
- [x] Cash deposit/withdrawal forms
- [x] Account transfer functionality
- [x] Transaction history display

**Admin Interface:**
- [x] Transaction approval queue (Transactions tab)
- [x] Cash transaction processing

**Result:** Working cash transaction system with approval workflow

**Implementation notes:**
- Money movement lives in `src/server/services/cash.ts`, shared by the submit
  and approve paths so both validate and round identically.
- Transfers are a *single* row anchored to the source account with both
  `from_account_id` and `to_account_id` set. History queries match on all three
  account columns, so one row appears on both sides with opposite direction.
- Pending transactions do **not** reserve funds. The balance is re-checked at
  approval time and approval fails if the money is gone — the status change and
  the balance update share one db transaction, so nothing half-applies.
- Auto-approved transactions go straight to `completed` and leave
  `approved_by_admin_id` / `approved_at` null; no admin ever saw them.
- `interest` and `fee` transaction types exist in the schema but no procedure
  can create them yet; settling one throws.

**Money and concurrency (established here, applies to future services):**

Amounts are integer cents throughout, typed as `Cents` (a branded number in
`src/lib/money.ts`). Phase 3 is the reason: average cost basis divides and
stores the result, DRIP carries a fractional remainder forward indefinitely,
and realised gain subtracts near-equal numbers — all of which compound float
error in a way that deposits and withdrawals do not. Storing total cost and
total quantity, and deriving the average only for display, avoids accumulating
any error at all.

That is now what `holdings` does: `total_cost_basis` is a pool, in the sense UK
Section 104 and Canadian ACB use the word. A buy adds `quantity * price +
brokerage` to it; a sell removes a *proportion* of it —
`round(total * sold / held)` — and subtracts that from the stored total rather
than recomputing from a fresh average, so the rounding remainder stays in the
pool instead of leaking. A full exit takes the remaining cost exactly, by
construction. `averageCents` in `src/lib/money.ts` is the only division, and it
runs on the way to a screen.

It keeps the cache honest, too. Holdings are meant to be rebuildable from
`investment_transactions`; with a stored average the incremental and replayed
values round differently, so a reconciliation would report drift that isn't
there. And because the journal keeps every buy, adopting FIFO or specific-ID
lots in Phase 4 is a re-derivation rather than a data migration — the same
reversibility argument as whole shares.

`holdings.quantity` is a share count rather than money, so it is a plain
integer rather than scaled minor units. **Whole shares only:** a corporate
action that would leave a fraction settles the remainder to cash, the same
pattern DRIP already uses for its dividend remainder. Cash-in-lieu is not built
— it is a feature in its own right, for whenever a real split needs it.

Enforcement is a CHECK constraint (`typeof(quantity) = 'integer'`), not the
column type. SQLite's INTEGER is a declaration and stores 7.5 without
complaint, so the constraint is the only thing that actually stops a fraction;
affinity converts a lossless 7.0 to 7 first, so only genuine fractions are
rejected. Covered by a test.

Phase 3 owes this a friendly error: a split that does not divide evenly should
be refused with its own error `kind` rather than reaching the database and
failing on the constraint. Widening to fractional shares later is a lossless
multiply, so starting whole is the reversible direction.

Balance changes are issued as `balance = balance ± ?` with the funds check in
the same `WHERE` clause, and the row count decides success. The investment
service must do the same when a buy debits a cash account — a read-modify-write
is only safe because SQLite serialises writers, and nothing in the test suite
would reveal the difference.

**Error convention (established here, applies to future services):**

A single procedure can refuse for several different reasons that share one tRPC
code — `user.cash.transfer` has four. So services throw via `cashError(kind,
message)`, which attaches a `RuleViolation` (a plain `Error` carrying a `kind`)
as the cause. Callers branch with `isCashError(err, kind)` instead of matching
on message text.

**The machinery lives in `src/server/services/errors.ts`, and a new service
uses it rather than copying it.** Declare the kind→code table, pass it to
`defineRuleErrors(domain, codes)`, and export the `error`/`is` pair it returns —
which is all `cash.ts` now does. Two hand-written copies of this would be two
implementations free to drift, and the `is` half is subtle enough to drift
badly.

The domain string is part of the match, not a label. Kind names are unique only
within a service: investments will refuse with `account_not_found` too, and
without the domain `isCashError(someInvestmentFailure, "account_not_found")`
answers true — the exact confusion `kind` exists to prevent. Covered by a test.

`requiresApproval` moved to `src/server/services/approval.ts` for the same
reason. The rule is about the user rather than about what they are attempting,
so cash and investments must both consult it and both get the same answer.

Codes follow the split: malformed input is `BAD_REQUEST`, state that forbids the
operation is `CONFLICT`, missing rows are `NOT_FOUND`.

| kind | code |
|---|---|
| `account_not_found` | NOT_FOUND |
| `account_closed` | CONFLICT |
| `insufficient_funds` | CONFLICT |
| `invalid_transfer` | BAD_REQUEST |
| `unsettleable_type` | CONFLICT |
| `already_decided` | CONFLICT |

The domain error is deliberately transport-free, so if a non-tRPC caller ever
needs this logic (a scheduled interest-posting job, a bulk importer) the
services can stop wrapping in `TRPCError` without changing any of the kinds.
Phase 3's investment service should follow the same shape.

### Phase 3: Investment Transaction System (Complete Slice)
**Admin API:**
- [ ] Investment transaction approval endpoints
- [ ] Holdings management operations

**User Interface:**
- [ ] Investment account detail pages with holdings
- [ ] Buy/sell order forms  
- [ ] Portfolio overview with current values

**Admin Interface:**
- [ ] Investment transaction approval
- [ ] Holdings adjustments for corporate actions

**Result:** Working investment transaction system

**Trades do not move cash.** `investment_accounts` has no settlement account, so
a buy debits nothing and a sell credits nothing — the account is a position
tracker, which is what Sharesight and most portfolio trackers are. Realised gain
on a sell is therefore a *reported* figure on the transaction, not a balance
change anywhere; "where did my profit go" is the first question this will
prompt, so say it in the UI.

The consequence to watch is that a buy raises the portfolio against nothing, and
both dashboards fold investments into a net-worth total. Recording a $5,000 buy
raises that total by $5,000. That is a labelling decision, not a modelling bug —
but it is the part most likely to mislead a supervised user.

Deferred rather than dropped, and the retrofit is additive: a nullable
settlement FK on `investment_accounts`, plus one `moveBalance` call inside the
settle path (issued as SQL, per the concurrency rule above). No holdings maths
changes. Adding the column before anything writes it would only create an
untestable branch, which is why it waits.

**Cost, not value.** Until Phase 4 brings in market prices there is no such
thing as portfolio value here — `totalCost` on an investment account is the sum
of `total_cost_basis`, and the UI says "Cost Basis". Keeping the word "value"
free means it will mean something when prices arrive, rather than quietly
changing definition under an unchanged label.

### Phase 4: Advanced Investment Features
- [ ] Dividend processing and DRIP functionality
- [ ] Cost basis calculations and tax lot tracking  
- [ ] Portfolio analytics and performance reporting
- [ ] Market data integration for real-time values

### Phase 5: Enhanced Features
- [ ] Advanced reporting and analytics
- [ ] Bulk operations and data import/export
- [ ] Enhanced security and audit logging
- [ ] Mobile-responsive design improvements

## Key Design Decisions

### Account Creation
- **Admin-created accounts:** Only admins can create new accounts for users
- **Investment account setup:** Created empty, holdings added via transactions
- **User approval settings:** Set `requires_transaction_approval` based on user relationship
- **Account numbering:** Auto-generated unique account numbers

### Transaction Processing
- **User-based approval:** Configurable per user via `requires_transaction_approval`
- **Flexible workflow:** Trusted users get auto-approval, supervised users need admin review
- **Audit trail:** Complete transaction history with status changes

### Holdings Management
- **Transaction-driven:** Holdings calculated and maintained from transaction history
- **Average cost method:** Default for simplicity
- **Holdings as cache:** Updated automatically when transactions are processed
- **Audit capability:** Can rebuild holdings from transaction history
- **Tax lot tracking:** Available by querying investment_transactions history
- **Corporate actions:** Manual processing initially

### Security Considerations
- **User-based controls:** Configurable transaction approval requirements per user
- **Admin permissions:** Only admins can modify user approval settings
- **Audit logging:** Track all admin actions and approvals
- **Input validation:** Strict validation on all financial data
- **Balance verification:** Regular reconciliation checks

## Future Enhancements

- Market data integration for real-time portfolio values
- Automated dividend processing
- Tax reporting (1099 generation)
- Mobile-responsive design improvements
- Portfolio performance analytics
- Asset allocation tools
- Automated rebalancing
- Integration with external financial data providers
- Cash transfers between cash accounts and investment accounts
- Separate linked settlement accounts (if needed for complex cash management)

---

*This plan provides a comprehensive foundation for Kitty Bank's account management system while maintaining flexibility for future enhancements.*