# Beyond Folio — DynamoDB Data Model

> **Status:** Authoritative data model for Beyond Folio (Phase 1).
> **Database engine:** Amazon DynamoDB.
> **Source of truth for requirements:** [`FEATURES.md`](./FEATURES.md).

---

## Section Index

| #   | Section                                 | Status |
| --- | --------------------------------------- | ------ |
| 1   | Introduction & Scope                    | ✅     |
| 2   | Design Principles                       | ✅     |
| 3   | Entities & Relationships (Conceptual)   | ✅     |
| 4   | Access Patterns Catalog                 | ✅     |
| 5   | Design Decisions & Rationale (ADRs)     | ✅     |
| 6   | Table Design Overview                   | ✅     |
| 7   | Main Table — Item Definitions           | ✅     |
| 8   | Global Secondary Indexes (GSIs)         | ✅     |
| 9   | Auxiliary Tables — Price Cache (+ Sessions, §9.7) | ✅     |
| 10  | Handling the Tricky Requirements        | ✅     |
| 11  | Example Items (Sample Data)             | ✅     |
| 12  | Access Pattern → Implementation Mapping | ✅     |
| 13  | Open Questions & Assumptions            | ✅     |

---

## 1. Introduction & Scope

### 1.1 Product Context

Beyond Folio is an **investment portfolio management and trading journal** application. Many investors spread their trades across several brokers, which makes it hard to see the full picture in one place. Beyond Folio solves this by letting a user bring trading history from multiple brokers (Robinhood, Fidelity, Zerodha) into a single, unified platform — so they can browse their complete trade history, understand their portfolio's true rate of return, and keep a journal recording why they made each decision, what they predicted, and whether it played out.

This document describes the **Phase 1** data model only. The full, authoritative description of product behavior lives in [`FEATURES.md`](./FEATURES.md); this paragraph exists only so the data model is self-grounding when read in isolation. Where this document and `FEATURES.md` ever appear to disagree, **`FEATURES.md` wins** and this document should be corrected.

### 1.2 Purpose of This Document

This document defines **how Beyond Folio's data is stored and accessed in DynamoDB**. It is intended to be the single reference a developer consults to answer "where does this data live, how is it keyed, and how do I query it?" — and equally, "why is it modeled this way, and what approaches did we deliberately reject?"

To serve that second goal, the document doubles as a **do's-and-don'ts reference book**: every non-obvious decision is captured as an Architecture Decision Record (ADR) in §5, and individual modeling choices throughout the document carry inline **"why" callouts** that cross-reference the relevant ADR. The intent is that future contributors can understand the reasoning without having to re-derive (or accidentally re-litigate) it.

### 1.3 Design Methodology

This model is designed **fresh from the product requirements** in `FEATURES.md`, using an **access-pattern-first** approach: we first enumerate the questions the application must ask of its data (the access patterns), and only then design tables, keys, and indexes that answer those questions efficiently. No entity, attribute, key, or index appears in this model unless a feature or query in `FEATURES.md` demands it.

> **Why access-pattern-first?** DynamoDB rewards designs that are shaped around known queries and punishes designs that assume relational-style ad-hoc querying. Starting from access patterns keeps the model lean and ensures every key earns its place. _(See ADR-001 in §5.)_

### 1.4 In Scope

The following Phase 1 capabilities from `FEATURES.md` drive this data model:

| Area                                   | FEATURES.md ref | What the model must support                                                                                                                 |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Statement import**                   | §5.1            | Storing imported broker data as clean, structured trades and cash activity.                                                                 |
| **Two-layer deduplication**            | §5.2            | (a) Detecting a re-uploaded file; (b) preventing the same trade from being recorded twice.                                                  |
| **Unified trade history**              | §5.3            | Listing all of a user's trades across all brokers/accounts in one combined view.                                                            |
| **Portfolio rate of return (XIRR)**    | §5.4            | Retrieving every cashflow (deposits, withdrawals, buys, sells, dividends, fees) plus current holding value, per user and currency.          |
| **Trading journal**                    | §5.5            | Multiple journal entries per trade; notes, a prediction (bullish/bearish/neutral), and multiple user-defined tags per entry (many-to-many). |
| **Prediction evaluation**              | §5.6            | Marking a journal entry Win / Loss / Breakeven on user demand, using current price.                                                         |
| **Source scorecard (tag performance)** | §5.7            | A running win/loss tally per tag, updated on each evaluation.                                                                               |
| **Up-to-date prices**                  | §5.8            | A short-lived cache of latest market prices, reused for a short time.                                                                       |
| **Corporate action handling**          | §5.9            | Mapping an old/changed ticker symbol to its current equivalent; admin can add/correct mappings.                                             |
| **Multiple accounts & currencies**     | §5.10           | Multiple accounts per user (even within one broker); USD and INR held side by side with **no conversion**.                                  |
| **User privacy / isolation**           | §2              | A user only ever sees their own data.                                                                                                       |

### 1.5 Out of Scope

The following are explicitly **not** in Phase 1 (`FEATURES.md` §6) and are therefore **not modeled** here. They are listed so that the model is not pre-loaded with speculative entities:

- **Holdings / live portfolio view** — no current-positions breakdown is modeled. _(Sense clarification: what is deferred is the **stored, browsable positions view** — a screen/entity listing "you currently hold X shares of Y." Phase 1 does **not** ship that. It is distinct from the **transient holding quantity** the XIRR calculation derives on the fly — netting a user's Trade records to value what they still hold as the final cashflow (FR-X1, §10.2). That derivation is in Phase 1; it is computed in memory and discarded, never stored or shown as a positions page.)_
- **Realized / unrealized P&L** — no profit/loss reporting structures are modeled. _(The §5.12 trade chart shows only factual buy/sell markers; computing realized P/L on sell markers — which needs a cost-basis method — is deferred to Phase 2.)_
- **Analytics / dashboards** — no dashboard-style analytics or summary-aggregation entities are modeled. _(The single per-trade price chart of `FEATURES.md` §5.12 (FR-H5) — one ticker's price line with the user's own buy/sell markers — **is** in scope; see AP-31/AP-32 and ADR-014. It is a per-trade view, not a portfolio-wide analytics dashboard.)_

> **Why call out the exclusions?** Access-pattern-first means we resist modeling for features that don't exist yet. If these arrive in a later phase, they will be designed then, against their own access patterns. _(See ADR-001 in §5.)_

The known limitations and open product questions from `FEATURES.md` §7 (identical same-day transfers, Zerodha F&O open/close ambiguity, dividend-reinvestment handling) are tracked in §13.

### 1.6 Document Conventions

The following conventions are used throughout this document:

- **Partition key / sort key:** the DynamoDB primary key attributes are named **`PK`** (partition key) and **`SK`** (sort key). All main-table items use this composite key.
- **Key tokens:** key values use a `TYPE#identifier` token style, with `#` as the separator and `USER#<userId>` as the root prefix for all user-owned items — e.g. `PK = USER#u_123`, `SK = TRADE#2026-01-15#t_789`. This makes keys human-readable and supports prefix-based queries.
- **Item type attribute:** every item carries an **`entityType`** attribute (e.g. `"Trade"`, `"JournalEntry"`) so items can be identified independently of their key, which aids debugging, streams processing, and migrations.
- **GSI attributes:** global secondary index keys are named `GSI1PK` / `GSI1SK`, `GSI2PK` / `GSI2SK`, etc. They are introduced and justified in §8.
- **"Why" callouts:** blockquotes beginning with **"Why"** explain the reasoning behind a choice and cross-reference an ADR in §5.
- **ADR references:** written as `ADR-NNN` and resolved in §5.
- **Example values:** identifiers like `u_123` / `t_789` are illustrative placeholders, not a prescribed ID format (ID generation is discussed where relevant).

---

## 2. Design Principles

These principles are the rules every later section obeys — read them as the guardrails for the whole model and the compass for any future change. Each principle is written as a balanced pair: a **Do:** that states the rule in full and a **Don't:** that names the tempting mistake it prevents, followed by the requirement that **drives** it and the **ADR** (§5) that records the full reasoning.

### 2.1 Access-Pattern-First

- **Do:** Design every table, key, and index to serve a specific query from the Access Patterns Catalog (§4), so each one earns its place by answering a real question the app asks.
- **Don't:** Add an entity, attribute, or index "just in case" or because a relational schema would have had it.
- _Driven by:_ the entire `FEATURES.md` feature set; out-of-scope items in §6.
- _Why:_ DynamoDB has no efficient ad-hoc query engine; cost and performance come from designing around the queries you actually run. _(ADR-001.)_

### 2.2 Per-User Data Isolation, Rooted in the Key

- **Do:** Root every user-owned item's key at the user with `PK = USER#<userId>`, so a single query for one user can never return another user's items and isolation is a property of the data layout itself.
- **Don't:** Enforce privacy with application-layer filtering alone; the key must guarantee isolation, not the code that reads it.
- _Driven by:_ `FEATURES.md` §2 ("Every user only ever sees their own data").
- _Why:_ Putting the user at the partition root naturally co-locates a user's data and enables clean, per-user access controls. _(ADR-002.)_

### 2.3 Single Table by Default, with Purposeful Exceptions

- **Do:** Keep the whole user-owned domain (users, accounts, trades, cashflows, journal entries, tags, scorecards, symbol mappings) in one main table (`BeyondFolio`) so related items are retrievable together in a single query.
- **Don't:** Fragment the user-owned domain across many tables; split out only data with a fundamentally different lifecycle or ownership — specifically the global, ephemeral, TTL-driven price cache (§9).
- _Driven by:_ unified trade history (§5.3), XIRR aggregation (§5.4) — both benefit from co-located, single-query access; price caching (§5.8) — fundamentally different lifecycle.
- _Why:_ A single table serves the domain's read patterns efficiently, while a separate cache table avoids polluting it with short-lived, shared, TTL-expiring rows. _(ADR-003.)_

### 2.4 Denormalize Over Joins

- **Do:** Duplicate small, stable pieces of data onto the items that read them (this is _denormalization_ — deliberately storing a copy of data in more than one place) — for example, carrying a trade's symbol and currency onto journal entries that reference it — so a read needs as few item lookups as possible.

- **Don't:** Assume runtime joins or design as if one item can be transparently expanded from another; DynamoDB has no joins.
- _Driven by:_ unified history (§5.3), evaluation (§5.6), scorecard (§5.7).
- _Why:_ Denormalization trades cheap storage and a little write-time effort for fast, simple reads — the right trade-off for a read-heavy app. _(ADR-004.)_

### 2.5 Idempotency & Conditional Writes

- **Do:** Make writes idempotent by deriving deterministic keys from natural identifiers and guarding them with conditional expressions such as `attribute_not_exists(PK)`, so a repeated write is a safe no-op.
- **Don't:** Implement deduplication by reading first and then writing; that pattern races and lets duplicates slip in under concurrent imports.
- _Driven by:_ two-layer dedup (§5.2) — file-level and trade-level; safe re-uploads.
- _Why:_ A deterministic key plus a conditional put is the DynamoDB-native way to guarantee "record this only once" atomically. _(ADR-005.)_

### 2.6 Pre-Computed Aggregates via Atomic Counters

- **Do:** Maintain running totals — notably the tag win/loss scorecard — as atomic counter attributes incremented with `ADD` in an `UpdateItem`, so the total is always current and the read is O(1).
- **Don't:** Recompute a tag's record by scanning all of its journal entries on every read.
- _Driven by:_ source scorecard (§5.7), which is read to show track records and updated on each evaluation (§5.6).
- _Why:_ Atomic increments are concurrency-safe and far cheaper than aggregating over many entries at read time. _(ADR-006.)_

### 2.7 Currency Isolation — No Conversion

- **Do:** Store every monetary amount in its original currency, tag it with that currency, and scope every aggregation (notably XIRR) to a single currency.
- **Don't:** Convert between USD and INR or combine them into one total; a mixed-currency figure is meaningless.
- _Driven by:_ multi-currency handling (§5.10) — "amounts are kept in their original currency — there is no currency conversion."
- _Why:_ Isolating by currency keeps every computed figure correct and honest in Phase 1. _(ADR-007.)_

### 2.8 TTL for Ephemeral Data

- **Do:** Stamp cached prices with a DynamoDB Time To Live attribute so they expire automatically once they are no longer fresh.
- **Don't:** Treat cached prices as durable records, or build scheduled jobs to hunt down and purge stale entries.
- _Driven by:_ up-to-date prices (§5.8) — "reuses them for a short time."
- _Why:_ TTL gives automatic, zero-maintenance expiry that matches the "fetch fresh, reuse briefly" requirement exactly. _(ADR-008.)_

### 2.9 Model Time for Chronological Access

- **Do:** Encode timestamps or dates into the sort key wherever the app needs results in time order — trade history and the cashflow timeline for XIRR — so the query returns them already sorted.
- **Don't:** Rely on fetching a large set and sorting it in application code after the fact.
- _Driven by:_ unified history browsing (§5.3), XIRR's need for time-ordered cashflows (§5.4).
- _Why:_ DynamoDB returns items ordered by sort key within a partition, so time in the SK gives ordered results straight from the query. _(ADR-009.)_

### 2.10 Stable Symbol Resolution

- **Do:** Resolve every ticker symbol through a single maintained mapping so a changed or old symbol is recognized as its current equivalent at the points that matter — import, valuation, and evaluation.
- **Don't:** Scatter raw broker symbols throughout the data with no canonical reference to fall back on when a symbol changes.
- _Driven by:_ corporate action handling (§5.9).
- _Why:_ Symbols change over time (mergers, spin-offs, renames); one resolution path keeps a user's history consistent and pricing/evaluation accurate. _(ADR-010.)_

---

## 3. Entities & Relationships (Conceptual)

> **Read this section as a map of business _concepts_, not a list of tables.** In a relational database each entity below would typically become its own table joined by foreign keys. In DynamoDB we deliberately do the opposite: **almost all of these concepts live as different item types inside one physical table** (`BeyondFolio`), distinguished by their key prefixes and `entityType` attribute. The price cache is the only concept that gets its own table in this data model. So "many entities → few tables" is expected here — the physical layout is decided in §6–§9; this section only establishes _what exists_ and _how the concepts relate_, which is what we need before we can shape keys. _(See ADR-003. A third, sessions table is introduced later by the TRD's auth design — TRD §5.4/§7.1.)_

### 3.1 The Entities

Each entity below is justified solely by a feature or requirement in `FEATURES.md`. The "Materializes as" column previews where the concept physically lives, to keep the concept/table distinction front-of-mind.

| #   | Entity                    | What it represents                                                                       | Why it exists (`FEATURES.md`)                                                       | Ownership                                    | Materializes as                                                  |
| --- | ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **User**                  | A trader/investor account holder                                                         | §2 privacy; the owner of everything                                                 | Per-user (the root)                          | Item in main table under `USER#<id>`                             |
| 2   | **BrokerAccount**               | A specific brokerage account held by the user                                            | §5.10 accounts per user; Phase 1 = one per broker (multiple-per-broker = Phase 2); carries broker + currency | Per-user                                     | Item(s) in main table under the user                             |
| 3   | **Trade**                 | A single security transaction (buy/sell of a stock, ETF, option, etc.)                   | §5.1 import, §5.3 unified history, §4 instrument types                              | Per-user                                     | Item(s) in main table under the user                             |
| 4   | **Cashflow**              | A movement of money: deposit, withdrawal, dividend, fee — and the cash leg of a buy/sell | §5.4 XIRR needs every cash movement with its date                                   | Per-user                                     | Item(s) in main table under the user                             |
| 5   | **ImportedFile**          | A record of a broker statement file that was uploaded                                    | §5.2 file-level dedup ("same file won't import twice")                              | Per-user                                     | Item in main table under the user                                |
| 6   | **JournalEntry**          | One journal note on a trade: free-text + prediction + (later) evaluation result          | §5.5 multiple entries per trade; §5.6 evaluation                                    | Per-user                                     | Item(s) in main table under the user, nested beneath their trade |
| 7   | **Tag**                   | A user-defined label (e.g. "swing trade", "Money Control")                               | §5.5 user-defined tags                                                              | Per-user                                     | Item in main table under the user                                |
| 8   | **JournalEntry–Tag link** | The association attaching a tag to a journal entry (many-to-many)                        | §5.5 an entry can have many tags; a tag applies to many entries                     | Per-user                                     | Represented in main table (see §3.3 / §7)                        |
| 9   | **TagScorecard**          | The running win/loss tally for one tag                                                   | §5.7 source scorecard, updated on each evaluation                                   | Per-user                                     | Counter item in main table under the user                        |
| 10  | **SymbolMapping**         | A mapping from an old/changed ticker to its current equivalent                           | §5.9 corporate-action handling; admin-maintained                                    | **Global / admin-owned** (the one exception) | Item in main table under a global partition                      |
| 11  | **PriceCache entry**      | The latest fetched market price for one symbol, short-lived                              | §5.8 up-to-date prices, reused briefly                                              | **Global**, ephemeral                        | Item in the **separate** price-cache table (§9)                  |
| 12  | **BrokerMapper**          | An admin-maintained "recipe" for reading one broker file type: `columnMapping` + interpretation rules + `headerFingerprint` + `version` | §5.1 import ("reads and understands" broker files); §5.9 admin-maintained precedent | **Global / admin-owned** (like SymbolMapping) | Item in main table under a global/admin partition                |

> **Why are Trade and Cashflow separate concepts (rows 3 & 4)?** Because two features read different slices of the same activity. Unified history (§5.3) wants only _trades_ (buys/sells), while XIRR (§5.4) wants _every_ money movement — deposits, withdrawals, dividends, and fees, none of which are trades. A buy/sell is genuinely both: a Trade (for history) and a cashflow (for XIRR). Keeping them as distinct concepts lets each feature read exactly its slice without filtering the other's data out. _(See ADR-011.)_

> **Why is SymbolMapping global/admin-owned (row 10), breaking the per-user rule (§2.2)?** A ticker change like FB→META is a market-wide fact, identical for every user, and `FEATURES.md` §5.9 explicitly says an **admin** adds/corrects these — i.e. it is shared system configuration, not personal data. Storing it once globally means an admin's correction applies to everyone at once and every user's import resolves symbols consistently. This is a deliberate, documented exception to per-user rooting. _(See ADR-012.)_

> **Why is BrokerMapper global/admin-owned (row 12)?** Like SymbolMapping, a broker's file format is a fact about the outside world, identical for every user, and only an **admin** curates it (`FEATURES.md` §5.1/§5.9 precedent). Storing one shared, versioned mapper per file type means an admin's fix to "how we read this broker" applies to everyone at once, and every user's import is normalized the same way. It is the second deliberate exception to per-user rooting (the first being SymbolMapping). _(See ADR-015, ADR-012.)_

> **How is a BrokerAccount identified, and how many per broker (row 2)?** In Phase 1 each user has **one BrokerAccount per broker**, and its `accountId` is a **deterministic per-(user, broker) id** — `acc_rh` (Robinhood), `acc_fid` (Fidelity), `acc_zer` (Zerodha). `broker` is a **separate attribute** on the BrokerAccount (and denormalized onto Trade/Cashflow), not something parsed back out of the id. On import the BrokerAccount is **found-or-created by `(userId, broker)`** via an idempotent conditional write (ADR-005) — so re-importing, or Zerodha's two files (equity + F&O), both resolve to the same `acc_zer`. `accountType` is **optional**, set only where the file states it (Zerodha = `Individual`; Fidelity single-account and Robinhood = unset in Phase 1 — not guessed). Multiple accounts within one broker (e.g. several Fidelity accounts) is a **Phase-2** extension. _(See ADR-015; cross-cutting decision A.)_

### 3.2 What We Deliberately Did _Not_ Make an Entity

Keeping faith with access-pattern-first (§2.1), some concepts a relational model might reflexively add are intentionally absent:

- **Broker** — there are only three fixed brokers (§3 of `FEATURES.md`); a broker is an attribute on a BrokerAccount, not an entity with its own access patterns. _(Distinct from the **BrokerMapper** entity in §3.1, which models **how to read a broker's file format** — an admin-owned import recipe — not the broker as a business object.)_
- **Instrument / Security master** — Phase 1 never queries "all trades of symbol X across all users," so a global security catalog isn't needed; symbol is an attribute on Trade/Cashflow, with SymbolMapping handling changes.
- **Currency** — USD/INR is an attribute (§2.7), not an entity.
- **Holdings / Positions, P&L, Analytics** — explicitly out of scope (§1.5).
- **Prediction** — it is not a standalone thing; it is fields on a JournalEntry (§5.5).

### 3.3 How the Entities Relate

The relationships below drive key design in §7. Note how each relationship is realized the **DynamoDB way** — as co-located items or denormalized data — rather than as a foreign key into a separate table.

| Relationship                     | Cardinality | How it's realized in DynamoDB                                                                               |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| User → BrokerAccount             | 1 → many    | BrokerAccounts are items in the user's partition.                                                           |
| User → Trade                     | 1 → many    | Trades are items in the user's partition (also tagged with their account).                                  |
| User → Cashflow                  | 1 → many    | Cashflows are items in the user's partition (tagged with account + currency).                               |
| BrokerAccount → Trade / Cashflow | 1 → many    | The `accountId` **and** `broker` are carried on each trade/cashflow item (denormalized); filter/index by broker (GSI1, §8.1). |
| Trade → JournalEntry             | 1 → many    | Journal entries are items nested under their trade (sort-key prefix), so one query lists a trade's entries. |
| JournalEntry ↔ Tag               | many ↔ many | Realized by link items + tag names denormalized onto the entry (resolved in §7).                            |
| Tag → TagScorecard               | 1 → 1       | One counter item per tag, updated atomically on evaluation (§2.6).                                          |
| Trade / Cashflow → SymbolMapping | many → 1    | Symbol on the item is resolved through the global mapping at import/valuation/evaluation.                   |
| Trade / Cashflow → PriceCache    | many → 1    | Current price for a symbol looked up from the cache table (§9) during valuation/evaluation.                 |
| ImportedFile → BrokerMapper      | many → 1    | Each uploaded file is read via the one BrokerMapper matched to its header fingerprint (§3.1, ADR-015); no foreign key — the match is by fingerprint at import time. |

> **Why nest JournalEntry under its Trade?** §5.5 says a trade can have many journal entries and the app always views them _in the context of a trade_. Nesting entries beneath their trade in the sort key makes "list all entries for this trade" a single, efficient query — the relationship is expressed by data locality, not a join. _(See ADR-004.)_

### 3.4 Conceptual Map (Text Diagram)

```
                (global / admin)                      (separate table, TTL)
          ┌───────────────┐   ┌──────────────┐      ┌──────────────────┐
          │ SymbolMapping │   │ BrokerMapper │      │ PriceCache entry │
          └───────▲───────┘   └──────▲───────┘      └────────▲─────────┘
                  │ resolves         │ reads file            │ priced by
                  │                  │                       │
         USER ─────────────────────────────────────────────────────
          │ owns
          ├──── BrokerAccount (broker, currency)
          │
          ├──── Trade ───────< JournalEntry >────── Tag (many-to-many)
          │        │                                  │
          │        │ also a                           │ tallied by
          │        ▼                                  ▼
          ├──── Cashflow                          TagScorecard
          │
          └──── ImportedFile (file-level dedup) ─────────────────── read via BrokerMapper
```

_All boxes under `USER` live in that user's partition in the main table. `SymbolMapping` and `BrokerMapper` live in a global/admin partition of the main table; `PriceCache entry` lives in the separate price-cache table._

---

## 4. Access Patterns Catalog

This is the **contract** the physical design (§6–§12) must satisfy: the concrete questions the application asks of its data, derived from `FEATURES.md`. Each pattern has a stable ID (**AP-N**), the question it answers, the feature that drives it, and whether it reads or writes. Keys and indexes are intentionally **not** specified here — §4 stays at the "what question" level so it remains a neutral requirements list; §12 maps each AP to its implementation.

> **Why catalog access patterns before designing keys?** Per §2.1, the keys and indexes exist _only_ to serve these patterns. Fixing the list first lets us design the minimum structure that answers every one — and lets a reviewer check that nothing in the model is unused and nothing required is missing.

### 4.1 Users & Accounts

| ID    | Access pattern (the question)                                               | Driven by | Type   |
| ----- | --------------------------------------------------------------------------- | --------- | ------ |
| AP-1  | Get a user's profile/settings                                               | §2        | Read   |
| AP-2  | Create / update a user                                                      | §2        | Write  |
| AP-2a | Provision a user's profile item on first authenticated sign-in (idempotent) | §2 (auth) | Write  |
| AP-2b | Verify the identity provider's token (Google OIDC / JWKS) → read `sub`      | §2 (auth) | Read\* |
| AP-2c | Resolve a `(provider, providerSub)` to our internal `userId` at login       | §2 (auth) | Read   |
| AP-3  | List all accounts belonging to a user                                       | §5.10     | Read   |
| AP-4  | Create / update an account (broker, currency) for a user                    | §5.10     | Write  |

> _AP-2b is served **upstream of DynamoDB** — the provider's ID token is verified against the provider's public keys (Google's JWKS), not by a table read. AP-2c then maps the provider's stable `sub` to our internal `userId` via the AuthIdentity item (§7.12). Together they give every request a documented, trusted `userId`. See ADR-013._

### 4.2 Import & Deduplication

| ID   | Access pattern (the question)                                              | Driven by  | Type  |
| ---- | -------------------------------------------------------------------------- | ---------- | ----- |
| AP-5 | Has this exact file already been imported by this user? (file-level dedup) | §5.2       | Read  |
| AP-6 | Record that a file has been imported (idempotent)                          | §5.2, §5.1 | Write |
| AP-7 | Does this specific trade already exist for this user? (trade-level dedup)  | §5.2       | Read  |
| AP-8 | Record an imported trade exactly once (idempotent)                         | §5.1, §5.2 | Write |
| AP-9 | Record an imported cashflow exactly once (idempotent)                      | §5.1, §5.4 | Write |
| AP-33 | On upload, find the BrokerMapper whose `headerFingerprint` matches this file (auto-detect broker + file type; no match → hard stop) | §5.1       | Read  |
| AP-34 | Admin: create / update / delete a BrokerMapper (idempotent on file type + `version`)   | §5.1, §5.9 | Write |

> _AP-33 is a **direct key read** of the matched BrokerMapper (a global/admin item, §7), and AP-34 is a plain admin write of that same item — both by the item's own key, so **neither needs a new GSI**. The header-fingerprint match is done in app code against the small, fixed set of mappers (one per file type). See ADR-015._

### 4.3 Trade History

| ID    | Access pattern (the question)                                                           | Driven by   | Type |
| ----- | --------------------------------------------------------------------------------------- | ----------- | ---- |
| AP-10 | List all of a user's trades across all brokers/accounts, newest first (unified history) | §5.3        | Read |
| AP-11 | List a user's trades filtered to one broker                                            | §5.10, §5.3 | Read |
| AP-12 | Fetch a single trade by id                                                              | §5.5, §5.6  | Read |
| AP-30 | List a user's trades filtered to one ticker (canonical symbol), newest first            | §5.3        | Read |

### 4.4 Portfolio Rate of Return (XIRR)

| ID    | Access pattern (the question)                                                                                         | Driven by  | Type |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| AP-13 | Get all cashflows for a user in a given currency, in date order (deposits, withdrawals, buys, sells, dividends, fees) | §5.4, §2.7 | Read |
| AP-14 | Get the symbols + quantities a user currently holds (to value current holdings for the final XIRR cashflow)           | §5.4       | Read |

### 4.5 Trading Journal & Tags

| ID    | Access pattern (the question)                             | Driven by  | Type  |
| ----- | --------------------------------------------------------- | ---------- | ----- |
| AP-15 | List all journal entries for a given trade                | §5.5       | Read  |
| AP-16 | Create a journal entry on a trade (note + prediction)     | §5.5       | Write |
| AP-17 | Fetch a single journal entry with its tags                | §5.5, §5.6 | Read  |
| AP-18 | List all tags defined by a user                           | §5.5       | Read  |
| AP-19 | Create a tag for a user (idempotent on name)              | §5.5       | Write |
| AP-20 | Attach one or more tags to a journal entry (many-to-many) | §5.5       | Write |
| AP-21 | List journal entries associated with a given tag          | §5.5, §5.7 | Read  |

### 4.6 Evaluation & Scorecard

| ID    | Access pattern (the question)                                               | Driven by | Type  |
| ----- | --------------------------------------------------------------------------- | --------- | ----- |
| AP-22 | Evaluate a journal entry → set Win/Loss/Breakeven using current price       | §5.6      | Write |
| AP-23 | Atomically update the win/loss counters for each tag on the evaluated entry | §5.7      | Write |
| AP-24 | Read a tag's win/loss scorecard                                             | §5.7      | Read  |
| AP-25 | List a user's tags ranked by track record (read scorecards for all tags)    | §5.7      | Read  |

### 4.7 Symbol Resolution (Corporate Actions)

| ID    | Access pattern (the question)                                  | Driven by | Type  |
| ----- | -------------------------------------------------------------- | --------- | ----- |
| AP-26 | Resolve a (broker, raw symbol) to its current canonical symbol | §5.9      | Read  |
| AP-27 | Add or correct a symbol mapping (admin)                        | §5.9      | Write |

### 4.8 Prices

| ID    | Access pattern (the question)                               | Driven by | Type  |
| ----- | ----------------------------------------------------------- | --------- | ----- |
| AP-28 | Get the cached current price for a symbol (if still fresh)  | §5.8      | Read  |
| AP-29 | Store a freshly fetched price for a symbol with a short TTL | §5.8      | Write |

### 4.9 Trade Price Chart

| ID    | Access pattern (the question)                                                                                                          | Driven by | Type  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- |
| AP-31 | Get a ticker's **historical price series** for the chart, for one `(canonicalSymbol, currency)` (if a fresh-enough series is cached)   | §5.12     | Read  |
| AP-32 | Store a freshly fetched historical price series for a `(canonicalSymbol, currency)`, dated so it can be reused for the rest of the day | §5.12     | Write |

> _The chart's **markers** are the user's own trades on that ticker — they need no new access pattern: they reuse **AP-30** (trades-by-ticker via GSI3), filtered in the app to the opened trade's currency/market (equity only — Stock/ETF). Only the **historical price line** is new, and it is served by AP-31/AP-32 against a historical-series cache (§9.6). See ADR-014._

### 4.10 Coverage Note

Every Phase 1 feature in `FEATURES.md` §5 maps to at least one access pattern above; out-of-scope items (§1.5) contribute none, by design. §12 will map each AP-N to the exact key/index that serves it, closing the loop from requirement → access pattern → implementation.

---

## 5. Design Decisions & Rationale (ADRs)

This section is the durable record of _why_ the model is shaped the way it is. Each Architecture Decision Record (ADR) captures one decision, the forces that led to it, the trade-offs it accepts, and the alternatives it rejects — so a future contributor can understand (and avoid re-litigating) the reasoning. **ADR-001 through ADR-010 formalize the ten design principles in §2 one-to-one** (the principle states the rule; the ADR records the full reasoning behind it). **ADR-011 through ADR-016 capture DynamoDB-era modeling decisions** that shape how concepts are split, where they live, how identity/authentication is handled, how the per-trade price chart is sourced, how broker files are read and normalized, and how the original uploaded files are retained. These ADRs are the **single source of truth** for these decisions; they are referenced from the memory bank rather than duplicated there.

> **Why keep ADRs at all?** A data model without recorded rationale invites the same rejected ideas to resurface every few months (e.g. "why not just convert currencies?", "why not one table per entity?"). Writing the reasoning down once — with the alternatives we considered and why we passed on them — turns this document into a do's-and-don'ts reference that protects the design over time. _(This is the purpose stated in §1.2.)_

**How to read an ADR (and who each part is for).** Every record below starts with an **In plain terms** line — one jargon-free sentence stating the decision and why it matters, written for _anyone_, technical or not. After that come the fuller fields, which get progressively more technical for the developer who has to build it: **Status** (all Accepted for Phase 1), **Context** (the problem we were solving), **Decision** (what we chose — mirroring the §2 `Do:` for ADR-001…010), **Consequences (trade-offs)** (what we gain and what it costs), **Alternatives rejected** (the tempting options we deliberately passed on — expanding the §2 `Don't:`), **Driven by** (the `FEATURES.md` reference), and, where decisions interlock, a **Related ADRs** line. A business reader can stop after _In plain terms_ and still understand the decision; a developer reads on for the precise mechanism. Where a technical term is unavoidable, it gets a short plain-language gloss the first time it appears.

### ADR-001 — Access-Pattern-First Modeling

- **In plain terms:** We first list the exact questions the app needs to ask of its data, then build only the structure needed to answer them — nothing speculative. This keeps the database lean, fast, and cheap to run.
- **Status:** Accepted.
- **Context:** Unlike a traditional SQL database, DynamoDB cannot answer arbitrary "search for anything" questions efficiently — it is fast and cheap only when the data is laid out to match the specific questions you already know you'll ask. So before choosing any keys, we need to know exactly which questions the app asks of its data; that is precisely the list in §4 (the access patterns AP-1 … AP-34).
- **Decision:** Let every table, key, field, and index be justified by a specific access pattern in §4. Nothing goes into the model unless a feature or query in `FEATURES.md` actually needs it; the access-pattern list is the checklist the design must satisfy — no more, no less.
- **Consequences (trade-offs):** We gain a lean design where every part earns its place, consistently fast reads, and an easy way for a reviewer to confirm nothing is unused or missing. The cost is less flexibility for surprise questions: a genuinely new kind of query may need a new index (and possibly reprocessing existing data) rather than a quick one-line change — so we revisit the access-pattern list deliberately whenever the product grows.
- **Alternatives rejected:** (a) Designing the data entities first and "figuring out the queries later" — the SQL habit that tends to produce a layout DynamoDB can't serve efficiently. (b) Adding fields or indexes "just in case" for features that don't exist yet (notably the out-of-scope Holdings/P&L/Analytics from §1.5) — this adds cost and extra write work today for no benefit; those will be designed against their own access patterns if and when they arrive.
- **Driven by:** the entire `FEATURES.md` §5 feature set; out-of-scope items in §6.

### ADR-002 — Per-User Data Isolation, Rooted in the Key

- **In plain terms:** Each user's data is filed under their own user ID, so one person's trades and journals are physically kept apart from everyone else's. Privacy is built into how the data is stored, not just enforced by the code.
- **Status:** Accepted.
- **Context:** `FEATURES.md` §2 is unambiguous: "Every user only ever sees their own data." This privacy rule is a hard requirement, not a nice-to-have, and it applies to everything a user owns (trades, cashflows, journals, tags, accounts, imported files, scorecards).
- **Decision:** Store every user-owned item under a key that begins with that user — `PK = USER#<userId>` (the partition key, i.e. the top-level "folder" the item is filed under). Because a read is always aimed at one user's folder, it simply cannot reach into another user's data; isolation is guaranteed by the storage layout itself.
- **Consequences (trade-offs):** We gain privacy that is structural (guaranteed by the key, not by remembering to filter in code), all of a user's data sitting together for fast single reads, and a clean per-user unit for access control. The cost is that we can't easily ask cross-user questions (e.g. "all trades of symbol X across every user") within this layout — but Phase 1 never needs that, and any genuinely shared/global data is handled as a deliberate exception (see ADR-012).
- **Alternatives rejected:** (a) Putting everyone's data together and filtering by a `userId` field at read time — privacy would then depend on every single query remembering to filter correctly, which is fragile and one slip leaks data. (b) A separate table per user — unmanageable as users grow, and unnecessary when the key already keeps users apart.
- **Driven by:** `FEATURES.md` §2 (privacy).
- **Related ADRs:** ADR-012 (the single, deliberate exception to this rule).

### ADR-003 — Single Table by Default, with Purposeful Exceptions

- **In plain terms:** Almost everything lives in one main table so a user's related data can be fetched together quickly. The one exception is short-lived market prices, which get their own table because they behave very differently from the rest.
- **Status:** Accepted.
- **Context:** A user's data is tightly connected and usually read together (their trades, journal entries, tags, and scorecards). DynamoDB is at its best when items that are read together are stored together in the same table. One thing stands apart, though — cached market prices (§5.8) — which are shared by all users and meant to live only briefly, a very different pattern from everything else.
- **Decision:** Keep all of the user-owned data in one main table (`BeyondFolio`), telling the different kinds of items apart by their key prefixes and an `entityType` label — so related items can be read in one go. Give a separate "helper" table to the shared, short-lived price cache (§9). A **third table** — a dedicated **sessions store** for authentication refresh tokens — is added by the TRD's auth design ([`TRD.md`](./TRD.md) §5.4/§7.1): it is a **second purposeful exception**, split out for the same class of reason as the price cache (it is **ephemeral and TTL-driven**, unlike the durable main-table data) plus a security reason (**least-privilege credential isolation** — only the auth code path is granted access, so no other Lambda that reads the main table can reach session credentials). This is a **pragmatic mix**, not single-table-for-its-own-sake.
- **Consequences (trade-offs):** We gain fast reads of related data, fewer moving parts, and a single clear home for almost everything. The cost is that one table holding many kinds of items can look confusing without the naming conventions in §1.6, and any future decision to add another table has to be justified — as the price cache (ephemeral/shared) and the sessions store (ephemeral/credential-isolated) each are. The two separate tables are extra things to run, but they keep short-lived data (and, for sessions, sensitive credentials) out of the durable, per-user store.
- **Alternatives rejected:** (a) One table per kind of data (the SQL reflex) — splits a single read into many trips, which DynamoDB can't stitch back together with joins. (b) Forcing _everything_ including prices into one table — would mean copying shared prices for every user, complicate automatic expiry, and mix fast-churning cache data into the long-lived store. (c) Keeping refresh-token sessions in the main table — rejected by the TRD because it would grant every main-table reader IAM access to session credentials and mix ephemeral TTL data into the durable store (TRD §5.4).
- **Driven by:** unified trade history (§5.3) and XIRR aggregation (§5.4), which benefit from reading related data in one query; price caching (§5.8), which behaves very differently.
- **Related ADRs:** ADR-008 (automatic expiry on the cache table), ADR-002 (per-user filing within the main table).

### ADR-004 — Denormalize Over Joins

- **In plain terms:** Instead of looking up related information in separate places at read time, we copy small, rarely-changing bits of it directly onto the records that need them. That way a single read returns everything a screen needs, with no stitching together.
- **Status:** Accepted.
- **Context:** DynamoDB cannot "join" — it can't combine data from several places in one query the way SQL does ("denormalize" = deliberately store a copy of data in more than one place to avoid that). Yet several features need combined data: unified history (§5.3) shows trade details on each row; evaluation (§5.6) and the scorecard (§5.7) need a journal entry's tags and its trade's symbol/currency together.
- **Decision:** Copy small, stable pieces of data onto the records that read them — for example, carry a trade's symbol and currency onto the journal entries that refer to it, and store the tag names directly on the entry — so a common read touches as few records as possible.
- **Consequences (trade-offs):** We gain fast, simple reads that return everything in one shot. The cost is a little extra storage (cheap) and a bit more work when writing, plus a rule to honor: if a copied value can change, every copy must be updated. To keep that burden small, we only ever copy data that is small _and_ rarely changes.
- **Alternatives rejected:** (a) Keeping one master copy and assembling the pieces in app code at read time — many more round trips and slower, and it reintroduces the SQL-style joining DynamoDB handles poorly. (b) Copying large or frequently-changing data — would make keeping the copies in sync expensive and error-prone, so we avoid it.
- **Driven by:** unified history (§5.3), evaluation (§5.6), scorecard (§5.7).
- **Related ADRs:** ADR-006 (the running counters are a specialized version of this same trade-off).

### ADR-005 — Idempotency & Conditional Writes

- **In plain terms:** If the same file or the same trade is uploaded twice, we make sure it gets saved only once — so re-uploading never creates duplicates or messes up a user's data. ("Idempotent" just means an action can be repeated safely with no extra effect.)
- **Status:** Accepted.
- **Context:** §5.2 requires two layers of duplicate-prevention: re-uploading the **same file** must not import it twice, and overlapping uploads must not record the **same trade** twice. Imports can be retried or happen at the same time, so "save this only once" has to be a hard guarantee, not a best effort.
- **Decision:** Give each record a fixed, predictable key derived from its own natural identity — for a file, a fingerprint of its contents (a "hash"); for a trade, the combination that makes it unique (account + symbol + date/time + quantity + price). Then save it with a condition that says "only write this if it isn't already here" (in DynamoDB, `attribute_not_exists(PK)`). A repeat upload simply does nothing, safely.
- **Consequences (trade-offs):** We gain duplicate-proof imports with no fragile "check then save" step, safe retries, and re-uploads that quietly correct themselves. The cost is careful thought about what truly makes each record unique. This also surfaces a known limitation honestly: two identical same-day Robinhood transfers (same amount, same day) produce the same key and so get recorded only once (`FEATURES.md` §7) — an accepted Phase 1 limitation tracked in §13.
- **Alternatives rejected:** (a) "Check if it exists, then save it" — two imports running at the same time can both pass the check and both save, creating a duplicate. (b) Cleaning up duplicates afterwards with a sweep job — complex, lagging, and reactive instead of preventing the duplicate at the moment of writing.
- **Driven by:** two-layer dedup (§5.2); import (§5.1); safe re-uploads.
- **Related ADRs:** ADR-009 (the date/time used in the trade's unique key), ADR-011 (a buy/sell writes both a Trade and a Cashflow, each saved only once).

### ADR-006 — Pre-Computed Aggregates via Atomic Counters

- **In plain terms:** We keep each tag's win/loss tally as a running total that we nudge up by one the moment an entry is evaluated — rather than re-counting a tag's whole history every time someone looks. So the scorecard is always ready instantly.
- **Status:** Accepted.
- **Context:** §5.7 keeps a running win/loss record for each tag, updated whenever a journal entry is evaluated (§5.6) and read to see which sources/strategies perform best (AP-24, AP-25). Re-counting a tag's record by scanning all of its entries on every read would be slow and only get slower as history grows.
- **Decision:** Keep each tag's win and loss totals as simple running counters on a TagScorecard record, and at evaluation time let the database add one to the relevant counter directly (an atomic "add one" operation — `ADD` inside `UpdateItem`). The total is always up to date, and reading the scorecard is a single instant lookup.
- **Consequences (trade-offs):** We gain instant, cheap scorecard reads and safe updates even if two evaluations happen at the same moment (the database adds them both correctly, with no risk of one overwriting the other). The cost is a small extra step on write — each evaluation must bump the counter for every tag on that entry — and because the counter _is_ the official tally, any correction (such as re-evaluating) must adjust it deliberately.
- **Alternatives rejected:** (a) Counting on the fly by scanning all of a tag's entries at read time — gets slower as history grows and defeats the "instant track record" goal. (b) Reading the number, adding one in app code, and writing it back — if two evaluations do this at once, one update can silently overwrite the other and a win/loss is lost.
- **Driven by:** source scorecard (§5.7); evaluation (§5.6).
- **Related ADRs:** ADR-004 (a pre-computed total is a copy of derived data, the same trade-off); ADR-002 (scorecards are per-user).

### ADR-007 — Currency Isolation, No Conversion

- **In plain terms:** Dollar amounts stay in dollars and rupee amounts stay in rupees — we never convert between them or add them together. A user with both currencies sees a separate rate-of-return figure for each, because mixing them would produce a meaningless number.
- **Status:** Accepted.
- **Context:** §5.10 says Beyond Folio handles both US Dollars and Indian Rupees and that, in Phase 1, "amounts are kept in their original currency — there is no currency conversion between the two." The rate-of-return figure (XIRR, §5.4) only makes sense within one currency, so the data has to keep the two apart.
- **Decision:** Store every money amount in its original currency, label each record with which currency it is, and run every total — especially the rate-of-return calculation — separately per currency. A user with both USD and INR activity gets two results, one for each.
- **Consequences (trade-offs):** We gain figures that are always correct and honest — nothing secretly blends currencies, and no made-up exchange rate distorts a return. The cost is that totals are calculated once per currency rather than all at once, and there is no single combined portfolio number in Phase 1 — which is intentional.
- **Alternatives rejected:** (a) Converting everything into one base currency — needs a source of exchange rates over time, introduces conversion error, and directly contradicts §5.10. (b) Simply adding dollar and rupee amounts together — produces a number that means nothing.
- **Driven by:** multiple accounts & currencies (§5.10); XIRR (§5.4).
- **Related ADRs:** ADR-009 (the per-currency, date-ordered list of money movements that feeds the return calculation).

### ADR-008 — TTL for Ephemeral Data

- **In plain terms:** Cached market prices are stamped with an expiry time so the database deletes them automatically once they go stale. We don't keep old prices around or run clean-up jobs to remove them.
- **Status:** Accepted.
- **Context:** §5.8 says Beyond Folio fetches the latest prices from outside market-data services and "reuses them for a short time" so the app stays fast and avoids repeated look-ups. These cached prices are meant to be short-lived — a stale price should simply disappear rather than be shown.
- **Decision:** Store cached prices in the separate price-cache table (§9) with an expiry timestamp (DynamoDB's "Time To Live", or TTL — a feature where the database auto-deletes an item once a set time passes). Freshness is part of the data itself, not something the app has to track and clean up.
- **Consequences (trade-offs):** We gain automatic, no-effort clean-up that exactly matches "fetch fresh, reuse briefly," and the cache naturally stays small. The cost is one caveat: this auto-deletion isn't instant — an expired price can linger a little before it's removed — so when reading, the app should still treat a too-old price as if it were missing rather than trusting it was already deleted.
- **Alternatives rejected:** (a) Treating cached prices as permanent rows in the main table — clutters the per-user data with shared, fast-changing values and gives no automatic expiry. (b) Running scheduled jobs to find and delete stale prices — extra machinery to build and operate when TTL does it for free.
- **Driven by:** up-to-date prices (§5.8).
- **Related ADRs:** ADR-003 (why the price cache is a separate table at all).

### ADR-009 — Model Time for Chronological Access

- **In plain terms:** Wherever the app needs data in date order — trade history and the timeline of money movements — we build the date into how records are filed, so they come back already sorted instead of us having to sort them afterwards.
- **Status:** Accepted.
- **Context:** Two features are naturally time-ordered: trade history (§5.3) is browsed newest-first, and the rate-of-return calculation (§5.4) needs every money movement listed by date. DynamoDB already returns items inside a folder in the order of their filing label (the "sort key"), so we can get date order essentially for free from how we file them — or pay for it over and over by sorting in code every time.
- **Decision:** Build the relevant date or timestamp into the filing label (sort key) for the records that need ordering — trade history and the money-movement timeline — so a single read comes back already in order (and can be asked for a date range, or in reverse for newest-first).
- **Consequences (trade-offs):** We gain reads that arrive pre-sorted, with no sorting in code, and efficient "between these dates" queries. The cost is being careful about how the date is written so it sorts correctly (using a standard year-month-day format), and that the primary ordering is by time — if we ever needed the same records ordered some other way, that would call for an extra index.
- **Alternatives rejected:** (a) Fetching a user's whole set and sorting it in code — wastes effort and gets slower as history grows. (b) Keeping the date only as an ordinary field (not part of the filing label) — would force a sort or a scan instead of a clean ordered read.
- **Driven by:** unified history browsing (§5.3); the date-ordered money movements behind XIRR (§5.4).
- **Related ADRs:** ADR-005 (the date/time is part of a trade's unique key); ADR-007 (these timelines are kept separate per currency).

### ADR-010 — Stable Symbol Resolution

- **In plain terms:** Company ticker symbols sometimes change (for example, Facebook's "FB" became "META"). We keep one shared list of these changes and use it everywhere, so an old symbol is always recognized as its current one — keeping each user's history and pricing accurate.
- **Status:** Accepted.
- **Context:** §5.9 notes that ticker symbols change over time through mergers, spin-offs, acquisitions, and name changes (e.g. FB→META). Without one trusted list to consult, a user's history would split across old and new symbols, and price/result look-ups would fail because they'd be searching for a symbol the market no longer uses.
- **Decision:** Look every ticker up against one maintained list of symbol changes (the SymbolMapping) at the moments that matter — when importing, when valuing the portfolio, and when evaluating a prediction — so an old or changed symbol is always understood as its current equivalent. There is one consistent way to resolve a symbol, rather than ad-hoc handling scattered through the code.
- **Consequences (trade-offs):** We gain a history that stays consistent and accurate even when symbols change, and reliable price/result look-ups. The cost is a look-up step in those paths and the upkeep of the list itself (detected automatically on import per §5.9, with an admin able to correct it).
- **Alternatives rejected:** (a) Keeping only the raw broker symbols with no shared reference — history splits and look-ups fail the moment a symbol changes. (b) Rewriting old trade records in place whenever a symbol changes — destroys the original as-imported record and is risky; looking it up at read time keeps the original intact while still showing the current equivalent.
- **Driven by:** corporate action handling (§5.9).
- **Related ADRs:** ADR-012 (the list itself is shared and admin-owned).

### ADR-011 — Trade and Cashflow Are Separate Concepts

- **In plain terms:** A buy or sell is two things at once: a trade (for the history view) and a movement of money (for the rate-of-return calculation). Deposits, withdrawals, dividends, and fees are only money movements. We record them as two separate kinds of record so each feature reads exactly what it needs without sifting through the rest.
- **Status:** Accepted.
- **Context:** The same broker activity is read by two features in different ways. The history view (§5.3) wants the list of **trades** — buys and sells of investments. The rate-of-return calculation (§5.4) wants **every movement of money** with its date and amount: deposits, withdrawals, dividends, and fees, _plus_ the cash side of those same buys and sells. A buy/sell genuinely is both: a trade for history and a money movement for the return figure. Deposits, withdrawals, dividends, and fees, on the other hand, are money movements only — they never show up in trade history.
- **Decision:** Treat **Trade** and **Cashflow** (a movement of money) as two separate kinds of record. Importing a buy/sell creates _both_ a Trade record (for the history view) and a matching Cashflow record (for the return calculation); a deposit, withdrawal, dividend, or fee creates a Cashflow record only. Each feature then reads just its own kind — history reads trades, the return calculation reads money movements — with no need to filter the other kind out.
- **Consequences (trade-offs):** We gain clean reads where each feature gets exactly what it needs: the history view never has to skip over deposits and fees, and the return calculation never has to dig cash amounts out of trade records. The cost is a little duplication on import — a buy/sell creates two records instead of one — and the rule that both must be written together (each saved only once, per ADR-005) so the two views never disagree.
- **Alternatives rejected:** (a) One combined "transaction" record serving both features — then every history read would have to filter out the non-trade money movements (deposits, withdrawals, dividends, fees), and every return calculation would have to dig cash amounts out of trade fields, making both do extra work every time. (b) Storing only trades and working out the money movements on the fly — impossible, because deposits, withdrawals, dividends, and fees aren't trades and have no trade record to derive them from.
- **Driven by:** unified trade history (§5.3) and XIRR (§5.4).
- **Related ADRs:** ADR-001 (each feature reads exactly what it needs); ADR-005 (both records saved only once); ADR-009 (money movements carry a date so they come back in order).

### ADR-012 — SymbolMapping Is Global / Admin-Owned

- **In plain terms:** The list of ticker-symbol changes (like FB→META) is the same for everyone, so we store it once in a shared place that admins maintain — not separately per user. This is the single, deliberate exception to our rule that everything is filed under an individual user.
- **Status:** Accepted.
- **Context:** ADR-002 makes filing everything under an individual user a core rule. But a ticker change such as FB→META is a **fact about the market**, identical for every user, and `FEATURES.md` §5.9 explicitly says an **admin** can add or correct these (they're also detected automatically on import). It's shared system information, not any one person's data — so filing it under a single user would be wrong.
- **Decision:** Keep the symbol-change list in one **shared, admin-owned area** of the main table, as the single, deliberate exception to the "everything under a user" rule (ADR-002). Every user's import, valuation, and evaluation consults this one shared list (ADR-010).
- **Consequences (trade-offs):** We gain one trusted list: an admin's correction applies to everyone at once, there are no per-user copies to keep in sync, and every user reads symbols the same way. The cost is the exception itself — there's now one area not filed under a user, which later sections (§7/§8) must flag clearly, and writing to it must be limited to admins so it can never become a way for one user's data to reach another.
- **Alternatives rejected:** (a) Copying the list into every user's area to keep the "everything under a user" rule unbroken — wastes space and means an admin's fix would have to be pushed out to every user, risking some being missed. (b) Giving it its own separate table — unnecessary, since it lives and lasts just like the rest of the main table's data and is easily kept apart by a distinct shared label; only the price cache, which behaves very differently (ADR-003/ADR-008), earns its own table.
- **Driven by:** corporate action handling (§5.9); the privacy rule it consciously excepts (§2).
- **Related ADRs:** ADR-002 (the rule this is the sole exception to); ADR-010 (the look-up path that uses this list); ADR-003 (why this stays in the main table rather than a new one).

### ADR-013 — Authentication via Self-Managed OAuth 2.0 (Google Phase 1, Zerodha Phase 2)

- **In plain terms:** Users sign in with **"Sign in with Google"** (and, in Phase 2, "Sign in with Zerodha"). We run the OAuth 2.0 / OpenID Connect flow ourselves — no third-party auth service like Cognito sits in the middle. We never handle passwords; the identity provider verifies the user, and we map their stable provider id to our own internal `userId`.
- **Status:** Accepted.
- **Context:** `FEATURES.md` requires user accounts and a `user` / `admin` role distinction, with sign-in via existing identities (Google now; Zerodha later). Two delivery options were weighed: federating providers **through Amazon Cognito**, or integrating OAuth **directly ourselves**. The deciding factor is the provider mix: **Google** is a standard OIDC provider, but **Zerodha (Kite Connect)** is a bespoke broker login, not a standards-compliant OIDC IdP that Cognito federates cleanly. Routing Google through Cognito but bolting Zerodha on separately would fragment auth into two mechanisms.
- **Decision:** Implement **self-managed OAuth 2.0 / OIDC**. We own the authorization-code flow (with `state`/`nonce`/PKCE), verify the provider's ID token against the provider's public keys (Google's JWKS), and read the stable subject id (`sub`). We mint our **own internal `userId`** and map external identities to it via an **AuthIdentity lookup item** (`PK = AUTH#<provider>#<providerSub>` → `userId`, §7.x) written idempotently (`attribute_not_exists`, ADR-005). The `role` (`user` / `admin`) is **stored and managed by us** on the `User` item — not supplied by the provider. On **first** successful sign-in we provision the `User` profile and the AuthIdentity item together (first-login provisioning). We issue and manage our **own session** after verifying the provider token; the exact session/token mechanism is deferred (see OQ-F, §13.1.x). In Phase 2, Zerodha is **added as a second sign-in method alongside Google** (not instead of it) — the same mechanism, with a second AuthIdentity item per user (§7.12, OQ-G) pointing at the same `userId`.
- **Consequences (trade-offs):** We gain one consistent auth pattern for **both** Google and Zerodha (Phase 2 is "another provider in the same shape"), no vendor lock-in, and no passwords ever. The cost is that **we own** the security-critical machinery Cognito would otherwise absorb: the OAuth handshake, per-provider token verification, our own session lifecycle (refresh/logout/revocation — OQ-F), account-linking across providers (Google↔Zerodha as one user — OQ-G, Phase 2), and our own user directory + admin tooling. This is real, security-sensitive work, accepted deliberately in exchange for control and a uniform multi-provider model.
- **Alternatives rejected:** (a) **OAuth via Amazon Cognito** (federate Google/Zerodha through Cognito) — cleaner for standard IdPs and offloads the risky plumbing, but Zerodha's bespoke login doesn't federate cleanly, forcing a fragmented two-mechanism design; also adds a managed-service dependency we chose to avoid. (b) **Email + password** (self-managed or via Cognito) — rejected; we don't want to own credential storage/reset, and social login is the desired UX.
- **Driven by:** `FEATURES.md` §5.11 (Sign in with Google; Zerodha planned); the privacy/isolation rule (§2).
- **Related ADRs:** ADR-002 (the verified, mapped `userId` roots every key); ADR-005 (the AuthIdentity item and first-login provisioning are idempotent conditional writes); ADR-012 (AuthIdentity is a non-user-rooted system item, like the global symbol map).

### ADR-014 — Trade Price Chart: Equity-Only, Markers from Trades, Lazy 1-Day Historical-Series Cache

- **In plain terms:** On an equity trade's detail view we show that ticker's historical price line with a marker at each of the user's buy/sell transactions. The markers reuse trade records we already store; the price line is fetched from an external market-data service the first time it's needed each day and reused for the rest of that day, so ten people opening the same ticker don't trigger ten look-ups.
- **Status:** Accepted.
- **Context:** `FEATURES.md` §5.12 (FR-H5) adds a per-trade price chart: a ticker's historical price line with a marker per user transaction (green circle = buy, red circle = sell; tooltip shows type/date/price/quantity). Two data questions arise. **(1) The markers** — where do the buy/sell points come from? We already store every Trade and can already list "a user's trades for one ticker" (AP-30, GSI3). **(2) The price line** — a _series_ of past daily prices — which we do **not** store: the current-price cache (§9.1–§9.5) holds only one latest value per symbol, minutes-fresh. So the only genuinely new data need is the historical series, and we must decide how to source it cheaply. At Phase-1 scale the only real cost in either approach is **external market-data API calls** (DynamoDB storage/reads are negligible); many users opening the same popular ticker the same day would otherwise each trigger a duplicate upstream call.
- **Decision:** **(a) Markers reuse existing Trades** — AP-30/GSI3 gives the user's trades for a canonical symbol; the app filters to the opened trade's currency and draws one marker each. No new stored entity. **(b) The historical price line is a lazily-populated, ~1-day-fresh cache** — a new `PRICEHIST#<canonicalSymbol>#<currency>` item (§9.6) in the existing auxiliary price-cache table, holding the daily series plus the `fetchedDate` it was pulled. On chart open we serve the stored series if `fetchedDate` is **today**, otherwise re-fetch once and overwrite (a plain last-write-wins write, like the current-price cache). It is ephemeral/TTL-backed, never a system of record (ADR-008). **(c) Scope:** the chart is shown for **equities only (Stock + ETF)**; options, index options, and funds show a "chart not available" fallback. The chart is scoped to the **opened trade's ticker + market/currency** — markers span all of the user's accounts for that ticker _on that market_, so a dual-listed ticker (e.g. an INR listing vs a USD listing) renders as one chart per market and never mixes currencies on one price line. **(d) Phase 1 shows only factual buy/sell markers — no computed profit/loss.**
- **Consequences (trade-offs):** We gain the chart with **one small new (ephemeral) item type and no change to durable data** — markers fall out of an index we already have. The lazy 1-day cache roughly halves upstream calls versus fetch-every-open and **eliminates same-day duplicate fetches**, at a DynamoDB cost of pennies/month, while staying resilient to provider rate-limits. The cost is a second cache shape to maintain and a freshness rule (reuse-if-fetched-today) the read path must honor. Deliberately **deferred to Phase 2:** realized **P/L on sell markers** — it needs a cost-basis method (average-cost vs FIFO give materially different per-sale numbers, and neither is tax-grade), so Phase 1 avoids showing a number that could mislead; when it lands it also brings profit/loss sell colouring and triangle markers (OQ-E covers the historical-series sourcing detail).
- **Alternatives rejected:** (a) **Fetch the series live on every chart open, store nothing** — simplest, but at 20 users it makes many redundant same-day calls for popular tickers and leans hardest on the provider's rate limit; the ~1-day cache removes those duplicates for ~pennies. (b) **A nightly cron that pre-fetches all tickers' series** — fetches series nobody views that day and forces us to enumerate "all tickers" up front; lazy fetch-on-first-view is self-maintaining and only ever fetches what someone actually opens. (c) **Durably storing full price history** — overkill for Phase 1 and contradicts the "not a market-data warehouse / prices are ephemeral" stance (ADR-008). (d) **Showing avg-cost realized P/L on sell markers in Phase 1** — rejected for now: it can diverge from a user's broker/1099 (which use FIFO/specific-lot), so it's deferred rather than risk a misleading figure.
- **Driven by:** `FEATURES.md` §5.12 (FR-H5); the cost/rate-limit reasoning above.
- **Related ADRs:** ADR-008 (the historical-series cache is ephemeral/TTL, same family as the current-price cache); ADR-010 (keyed by the canonical symbol, so a rename doesn't fragment the series); ADR-003 (it lives in the auxiliary cache table, not the durable main table); ADR-001 (markers reuse an existing access pattern rather than adding a speculative entity).

### ADR-015 — Admin-Managed BrokerMapper + a Distinct Normalization Step

- **In plain terms:** Each broker's export file is read by a small "recipe" — called a **BrokerMapper** — that says which column means what and how to interpret each row. Beyond Folio ships these recipes pre-built and only an **admin** maintains them; an ordinary user never configures column mappings or picks their broker from a menu — they simply upload a file, the app recognizes it and translates it into Beyond Folio's own consistent format, and they review a preview of the interpreted result and confirm it (a two-step _Proceed to Import_ → _Confirm_ flow — §10.8, TRD §2.3).
- **Status:** Accepted.
- **Context:** The three supported brokers export mutually incompatible files. Column names differ (`Activity Date` vs `Run Date` vs `order_execution_time`); the transaction verb is a clean code in some files (Robinhood `Trans Code`, Zerodha `trade_type`) but **free text** in others (Fidelity `Action`, e.g. `YOU BOUGHT …`); dates are month-first in the US files but day-first in India; numbers carry `$`, thousands commas, and parenthesis-negatives in one broker and are plain in another; options are encoded four different ways. Something has to translate each raw row into Beyond Folio's normalized Trade and Cashflow attributes — and it has to do so **without asking the user to describe their own file**, which they cannot reliably do. There are only three brokers and four file shapes (Robinhood, Fidelity, Zerodha-equity, Zerodha-F&O), all known in advance.
- **Decision:** Introduce a **shared, admin-owned `BrokerMapper`** entity — one per file type — as a deliberate global/admin-owned exception to per-user rooting, exactly like the SymbolMapping list (ADR-012). Each BrokerMapper holds a **`columnMapping`** (how each raw column becomes a normalized field), interpretation rules, a **`headerFingerprint`** (the ordered, normalized header column names), and a **`version`**. On upload the app **auto-detects both the broker and the file type from the header fingerprint** — no broker dropdown and no Zerodha equity-vs-F&O dropdown (the F&O header carries `expiry_date`, so the two Zerodha files self-resolve). If a file's header matches no mapper it is a **hard stop** ("this file doesn't match our internal formats — contact support"): because users can't edit mappers, a broker format change is an **admin** action (admin updates the mapper — the user retries). An admin **pre-seeds all four mappers before launch.** The `columnMapping` supports exactly **four kinds** of column rule: **`direct`** (copy a column straight through), **`lookup`** (map a raw code to a normalized value via a table), **`classify`** (interpret free text — e.g. the Fidelity `Action` classifier), and **`extract`** (pull structured sub-fields out of one column — e.g. the option-symbol parsers). A distinct **normalization step** then turns each mapped row into clean canonical values — the transaction-type catalogue, the option `optionDetails` parse, date normalization to `YYYY-MM-DD`, and number/format cleanup — always **preserving the raw verb/code string as `rawAction`** for audit, and **safe-failing** any row it can't confidently parse (the row is flagged/skipped, never silently mis-recorded). The account the rows belong to is found-or-created idempotently by `(userId, broker)` via a conditional write (ADR-005).
- **Consequences (trade-offs):** We gain one consistent normalization path for every broker, **zero configuration burden on users** (upload-and-confirm, no mapping UI), and a single place — the mapper — to fix a broker format change so every user benefits at once. The header-fingerprint auto-detect removes a whole class of user error (wrong-broker selection). The costs: an **admin must maintain** the mappers and keep their fingerprints unique (natural, since real headers differ), a genuine broker format change **blocks imports until an admin ships an updated mapper**, and Phase-1 mapper corrections are **forward-only** — rows already imported through a since-corrected mapper are not retroactively reprocessed in Phase 1 (that engine is Phase 2; the raw files it will need are retained per ADR-016).
- **Alternatives rejected:** (a) **User-editable column mapping** — push the mapping onto each user at upload; rejected because users cannot reliably describe their own broker's format, it multiplies support load, and it makes every user's data quality depend on their own configuration. (b) **Broker / file-type dropdowns** — ask the user to pick the broker and (for Zerodha) equity-vs-F&O; rejected as redundant and error-prone once the header fingerprint identifies both unambiguously. (c) **Per-broker hardcoded parsers with no shared entity** — bakes each format into code, so a broker format change is a code deploy rather than an admin data edit, and there is no single versioned record of "how we read this broker."
- **Driven by:** `FEATURES.md` §5.1 (import "reads and understands" broker files) and §5.9 (admin-maintained corporate-action mapping precedent); the four real broker file formats analyzed during import design.
- **Related ADRs:** ADR-012 (the same global/admin-owned pattern as SymbolMapping); ADR-005 (idempotent find-or-create of the account by `(userId, broker)` via conditional write); ADR-010 (canonical symbol resolution is consulted during normalization); ADR-016 (the raw uploaded files are retained so a corrected mapper can reprocess them in Phase 2).

### ADR-016 — Raw Uploaded-File Storage in Amazon S3

- **In plain terms:** Every broker file a user successfully imports is kept, byte-for-byte, in cloud file storage (Amazon S3) so that future features — re-importing after a mapper is corrected, or undoing an import — have the original file to work from. In Phase 1 we only **store** these files; nothing reads them back yet.
- **Status:** Accepted.
- **Context:** Mapper corrections are **forward-only** in Phase 1 (ADR-015): if a broker file was imported through a mapper that is later found to be wrong and corrected, Phase 1 does not go back and re-read that file. The raw bytes are the only thing that would let a Phase-2 feature reprocess those rows — and once discarded they cannot be recovered. The planned Phase-2 features **retroactive re-import** (reprocess an already-imported file with a corrected mapper) and **undo an import** (PRD §6, O6) both need the original file. So the choice is whether to keep the uploaded bytes now, before any feature reads them.
- **Decision:** **Keep every successfully-imported file** in Amazon S3. The **original pre-parse bytes exactly as uploaded** are first staged to a **temporary location** (a `temp/` prefix) at upload — via a pre-signed direct-to-S3 URL, so the bytes never transit the backend (TRD §7.2, §9.5) — and then, **on Confirm**, promoted to the permanent key `<userId>/<contentHash>` (no file extension — the content hash is the identity, matching the `FILE#<contentHash>` convention, and the `<userId>/` prefix keeps each user's files isolated per ADR-002). Promotion is part of the **confirm→write step**; at that point the `ImportedFile` record is **updated** with an **`s3Key`** attribute holding the **relative key only** (`<userId>/<contentHash>`) — the bucket is a single app-config value, never a full `s3://…` URL (see §7.3). The `contentHash` is the **same SHA-256** already computed for Layer-1 file dedup (one hash, two uses). This yields a clean **one uploaded file = one permanent S3 object = one `ImportedFile` record** mirror: files that hard-stop at mapper-match (ADR-015) or that the user never confirms are **never promoted** — the temp copy auto-expires via a `temp/`-scoped lifecycle rule and no permanent object is created. Bucket posture: **SSE-S3** (Amazon-managed AES-256 default encryption), **Block Public Access ON**, **TLS-only** bucket policy, **versioning OFF**; the permanent keys have **no lifecycle expiry (keep forever)** while the `temp/` prefix auto-expires abandoned uploads — writes are idempotent (same file → same key → byte-identical overwrite), and expiry of the permanent keys would silently reintroduce the very gap this decision exists to close. Access is **backend-service-only** with least-privilege IAM; there is **no download UI** (user or admin) in Phase 1, since these files are sensitive PII that nothing yet needs to read. If a write fails after promotion, the identical file overwrites the same key, so **orphans cannot accumulate** and no cleanup job is needed.
- **Consequences (trade-offs):** We eliminate a silent, permanent data-loss gap — the raw material for Phase-2 retroactive re-import and undo-an-import is guaranteed to exist. The cost is a **second persistence store** (S3 alongside DynamoDB) and pulling **PII-at-rest into Phase 1**; this is a deliberate, reversible trade (we can always delete stored bytes later) chosen over a loss that cannot be undone. Undo-an-import (Phase 2) must remember to delete **both** the `ImportedFile` record and its Trades/Cashflows **and** the S3 object at `s3Key`.
- **Alternatives rejected:** (a) **Defer storage entirely** — store nothing in Phase 1; rejected because every file imported before Phase 2 would be an unrecoverable gap for a corrected mapper. (b) **Reserve the slot but store nothing** — same permanent gap for pre-Phase-2 imports. (c) **Build the undo/reprocess engine now** — scope creep with zero Phase-1 benefit; storing the bytes is the only part that is time-sensitive. (d) **Retain every uploaded file permanently, including rejected/cancelled ones** — rejected because it introduces an orphan-retention/cleanup problem; instead, unconfirmed uploads live only briefly in the `temp/` prefix and auto-expire, and **only a confirmed import is promoted** to a permanent key, giving the clean 1:1 mirror.
- **Driven by:** the forward-only mapper-correction stance (ADR-015) and the Phase-2 features that depend on the raw file — retroactive re-import and **undo an import** (`PRD.md` §6, O6).
- **Related ADRs:** ADR-005 (idempotent same-key overwrite is why orphans can't accumulate); ADR-015 (the mapper whose forward-only corrections these retained files will let Phase 2 reprocess); ADR-002 (the `<userId>/` key prefix keeps each user's files isolated); ADR-003 (a deliberate additional store — a different store *class* than ADR-003's table split, but the same 'purposeful exception to one store' spirit).

---

## 6. Table Design Overview

**In plain terms:** Beyond Folio's data lives in **four tables**. The main store, `BeyondFolio`, holds almost everything a user owns (their accounts, trades, money movements, journal entries, tags, and scorecards), all filed under that user so it stays private and can be fetched together quickly. A small **helper table** holds recently-fetched market prices, which are shared by everyone and meant to live only briefly. A third **sessions table** (added by the TRD's auth design, [`TRD.md`](./TRD.md) §5.4/§7.1) holds ephemeral auth refresh tokens. A fourth **waitlist table** is a **temporary launch-gating** store — it holds sign-up emails while the app is invite-gated, and is **retired once open signup goes live** (the table and its `POST /waitlist` endpoint are removed and Google login becomes the direct entry point). This section is the bird's-eye view of that physical layout — it shows _what tables exist_, _how items are filed and labelled_, and _what lives where_ — and it is the bridge from the business concepts (§3) and the questions the app asks (§4) into the concrete structure that answers them. The fine print — exact item shapes (§7), the extra query paths or "indexes" (§8), and the auxiliary tables (§9) — is previewed here but defined in the sections that follow.

> **Why describe the whole layout before the item details?** A reader (and a reviewer) needs the shape of the forest before the trees: knowing there are four tables (main + price-cache + sessions + the temporary waitlist), that user data is filed under the user, and that one shared list is the lone in-main-table exception makes every later detail easier to place. _(See ADR-003, ADR-002.)_

### 6.1 The Tables at a Glance

Beyond Folio uses one main table for the durable, per-user domain, one auxiliary table for the ephemeral, shared price cache, a third **sessions table** for ephemeral auth refresh tokens (added by the TRD's authentication design, [`TRD.md`](./TRD.md) §5.4/§7.1), and a fourth **temporary waitlist table** that exists only during the invite-gated launch period and is removed at full launch (§9.8). The splits are deliberate and minimal — almost everything is consolidated in the main table, and each separate table earns its place because its data has a fundamentally different lifecycle (and, for sessions, a security-isolation need) from the rest.

|                     | **`BeyondFolio`** (main table)                                                                                                                           | **Price-cache table** (auxiliary)                                                                                            | **Sessions table** (auxiliary)                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Purpose**         | The system of record for everything a user owns, plus the one shared symbol-change list                                                                  | A short-lived cache of the latest market prices, so the app doesn't re-fetch the same price repeatedly                       | Short-lived auth **refresh tokens**, so a signed-in session can be renewed and revoked (TRD §5) |
| **Ownership**       | Per-user (rooted at `USER#<userId>`), with a single global/admin-owned area for symbol mappings                                                          | Global / shared — one cached price per symbol, used by all users                                                             | Per-user auth state; accessed **only** by the auth code path (least-privilege IAM)             |
| **Lifecycle**       | Durable — data persists until explicitly changed or deleted                                                                                              | Ephemeral — each entry auto-expires shortly after it is written (TTL — the database deletes the item once a set time passes) | Ephemeral — refresh tokens auto-expire via TTL; deleted on logout                              |
| **What lives here** | User, BrokerAccount, Trade, Cashflow, ImportedFile, JournalEntry, Tag (+ journal↔tag links), TagScorecard, SymbolMapping (global), AuthIdentity (login lookup) | PriceCache + PriceHistory entries                                                                                            | Session (refresh-token) entries                                                                |
| **Defined in**      | §7 (item definitions) and §8 (indexes)                                                                                                                   | §9                                                                                                                           | [`TRD.md`](./TRD.md) §5.4/§7.1 (owned by the TRD)                                               |
| **Driven by**       | ADR-003 (single table by default), ADR-002 (per-user rooting)                                                                                            | ADR-003 (purposeful exception), ADR-008 (TTL expiry)                                                                         | ADR-003 (second purposeful exception), ADR-008 (TTL), ADR-013 (auth); TRD §5.4                 |

> **Why these tables and not one, or many?** One table for the user-owned domain keeps related items together so they can be read in a single query (ADR-003), and rooting them at the user keeps each person's data private and co-located (ADR-002). The price cache is split out — not because prices are "different data," but because they are _shared_ (one price serves every user) and _ephemeral_ (they should auto-expire), which would otherwise pollute the durable per-user store and complicate automatic expiry (ADR-008). The sessions table is split out for the same ephemeral/TTL reason **plus** least-privilege credential isolation — only the auth path may read it, so no other component that touches the main table can reach session credentials (TRD §5.4). The fourth, the **waitlist table**, is a **temporary** launch-only store (§9.8) — short-lived scaffolding kept separate so it can simply be dropped once open signup is live, not part of the durable domain. We resist going further and splitting the user-owned domain into many tables, because that would reintroduce the cross-table stitching DynamoDB cannot do efficiently. _(See ADR-003, ADR-008; TRD §5.4/§7.1.)_

### 6.2 Primary Key Structure of the Main Table

Every item in the main table is addressed by a **composite primary key** — two parts together: a **partition key** (`PK`, the top-level "folder" an item is filed under) and a **sort key** (`SK`, the "filing label" that orders and distinguishes items within that folder). DynamoDB stores all items that share a `PK` together and keeps them ordered by `SK`, so a single query against one `PK` can sweep a whole folder of related items, optionally narrowed by an `SK` prefix or range.

For all user-owned data the partition key is rooted at the user: **`PK = USER#<userId>`**. This is the load-bearing choice behind privacy — because a read is always aimed at exactly one user's folder, it structurally cannot return another user's items; isolation is a property of the layout, not of remembering to filter in code (ADR-002). The single exception is the global symbol-change list, which sits under its own dedicated partition (§6.4).

The sort key uses the `TYPE#identifier` token style (with `#` as the separator), so different kinds of items coexist in the same user folder and are told apart by their `SK` prefix — for example `ACCOUNT#...`, `TRADE#...`, `TAG#...`. Where the application needs results in time order — trade history (§5.3) and the money-movement timeline for XIRR (§5.4) — the date is built into the sort key (e.g. `TRADE#2026-01-15#t_789`, using a year-month-day format that sorts correctly as text), so the query returns items already in chronological order with no sorting in code (ADR-009). _(The exact `SK` shape for each item type is finalized in §7; the values shown here are illustrative.)_

> **Why root every key at the user and overload the sort key by type?** It does two jobs at once: rooting at `USER#<userId>` guarantees per-user isolation (ADR-002), and letting many item types share that one partition (told apart by `SK` prefix) means a user's related data is co-located and retrievable together — the heart of the single-table approach (ADR-003). _(See ADR-002, ADR-003, ADR-009.)_

### 6.3 Item-Type Overloading & the `entityType` Attribute

Because many different kinds of items share the same table — and often the same user partition — the main table is **type-overloaded**: a single physical table holds Users, BrokerAccounts, Trades, Cashflows, ImportedFiles, JournalEntries, Tags, journal↔tag links, and TagScorecards — plus the two non-user-rooted system items, the global SymbolMapping (§7.10) and the AuthIdentity login lookup (§7.12) — each distinguished by its key prefixes rather than by living in a table of its own. ("Overloading" here simply means one structure carries several different kinds of content, kept straight by naming conventions — the `TYPE#identifier` tokens from §1.6.) This is exactly the "many concepts → one table" idea introduced in the §3 banner, now stated as a physical property of the table.

To make each item self-describing regardless of how it was reached, **every item also carries an `entityType` attribute** (e.g. `"Trade"`, `"JournalEntry"`, `"TagScorecard"`). The key prefix already identifies the type for querying, but the explicit attribute means an item dumped on its own — in a log, a stream event, or a migration script — can still be recognized without having to parse its key. The two work together: the key prefix is how you _find_ items of a type; `entityType` is how you _confirm_ what an item is once you have it.

> **Why label every item with `entityType` when the key prefix already encodes the type?** Redundant-looking, but cheap and valuable: it makes items self-identifying for debugging, change-stream processing, and future migrations, none of which should have to reverse-engineer meaning from a key string. _(See §1.6 conventions; supports the single-table approach of ADR-003.)_

### 6.4 The Global SymbolMapping Partition (the One Exception)

Every other partition in the main table is rooted at a user. The **symbol-change list (SymbolMapping)** is the single, deliberate exception: it is a market-wide fact, identical for every user, and maintained by an admin (`FEATURES.md` §5.9), so it is filed under its **own dedicated global partition** rather than under any user — for example `PK = GLOBAL#SYMBOLMAP` (illustrative; the exact key is finalized in §7). It still lives **inside the main table**, not in a separate table, because it is durable and long-lived just like the user-owned data and is easily kept apart by its distinct partition; only the price cache, which is both shared _and_ ephemeral, earns its own table (ADR-003).

This exception is safe precisely because it is narrow and explicit: the global partition holds only shared configuration (never any user's personal data), and writes to it are restricted to admins, so it can never become a path for one user's data to reach another. Reads of this partition happen during import, valuation, and evaluation, when a raw ticker is resolved to its current equivalent (ADR-010).

> **Why does the one global partition not undermine per-user isolation?** Because it contains no personal data — only shared market facts — and is admin-write-only. Per-user isolation (ADR-002) is about keeping _users'_ data apart; a shared, admin-owned reference list is categorically different, which is exactly why it is the sole documented exception. _(See ADR-012, ADR-002.)_

### 6.5 Forward Map — What Lives Where

The table below is a forward-looking index of where each concept from §3 physically lands, with an illustrative key root and a pointer to the section that defines it in full. It exists so a reader can see the whole placement at a glance before diving into the per-item detail of §7–§9. _(Key roots are illustrative — finalized in §7/§9.)_

| Concept (§3)          | Home table        | Key root (illustrative)                                     | Filed under                                      | Defined in |
| --------------------- | ----------------- | ----------------------------------------------------------- | ------------------------------------------------ | ---------- |
| User                  | `BeyondFolio`     | `PK = USER#<userId>`                                        | The user (the root item)                         | §7         |
| BrokerAccount         | `BeyondFolio`     | `PK = USER#<userId>`, `SK = ACCOUNT#...`                    | The owning user                                  | §7         |
| Trade                 | `BeyondFolio`     | `PK = USER#<userId>`, `SK = TRADE#<date>#...`               | The owning user, time-ordered                    | §7         |
| Cashflow              | `BeyondFolio`     | `PK = USER#<userId>`, `SK = CASHFLOW#<currency>#<date>#...` | The owning user, by currency + time              | §7         |
| ImportedFile          | `BeyondFolio`     | `PK = USER#<userId>`, `SK = FILE#<hash>`                    | The owning user (dedup key)                      | §7         |
| JournalEntry          | `BeyondFolio`     | `PK = USER#<userId>`, `SK = TRADE#...#JOURNAL#...`          | The owning user, nested under its trade          | §7         |
| Tag                   | `BeyondFolio`     | `PK = USER#<userId>`, `SK = TAG#<name>`                     | The owning user                                  | §7         |
| JournalEntry↔Tag link | `BeyondFolio`     | `PK = USER#<userId>`, link items                            | The owning user                                  | §7         |
| TagScorecard          | `BeyondFolio`     | `PK = USER#<userId>`, `SK = TAGSCORE#<name>`                | The owning user (atomic counters)                | §7         |
| SymbolMapping         | `BeyondFolio`     | `PK = GLOBAL#SYMBOLMAP`                                     | Global / admin (the exception)                   | §7         |
| BrokerMapper          | `BeyondFolio`     | `PK = GLOBAL#BROKERMAPPER`, `SK = MAPPER#<fileType>`        | Global / admin (import recipe)                    | §7.13      |
| AuthIdentity          | `BeyondFolio`     | `PK = AUTH#<provider>#<providerSub>`                        | Global / system (login lookup — not user-rooted) | §7.12      |
| PriceCache entry      | Price-cache table | `PRICE#<canonicalSymbol>#<currency>`, with TTL             | Global / shared, ephemeral                       | §9         |
| PriceHistory entry    | Price-cache table | `PRICEHIST#<canonicalSymbol>#<currency>`, with TTL         | Global / shared, ephemeral                       | §9.6       |
| Session (refresh token) | Sessions table  | `USER#<userId>` + per-session id, with TTL                 | Per-user auth state; auth-path-only access       | [`TRD.md`](./TRD.md) §5.4/§7.1 |
| Waitlist entry _(temporary)_ | Waitlist table | `email` (PK), with `joinedAt` / `source`               | Global launch-gating list; **retired at full launch** | §9.8 |

**Secondary query paths (GSIs), previewed.** A few access patterns ask a question that the primary `USER#<userId>` partition layout does not answer directly — they need to find items by something _other_ than the user-then-type-then-time path. These will be served by **Global Secondary Indexes** (a GSI is a secondary index — an alternate "filing system" over the same data that supports an extra query path). The three indexes that §8 will define are: **GSI1** — filtering trades to a single broker (AP-11); **GSI2** — listing journal entries by tag for the many-to-many relationship and scorecard (AP-21); and **GSI3** — filtering trades to a single ticker (trades-by-ticker, AP-30). (Unified trade history newest-first across all brokers (AP-10) and the per-currency date-ordered cashflow timeline for XIRR (AP-13) are served by the base table’s primary key, not a GSI.) The full index definitions — their keys, what they project, and which AP each serves — are deferred to §8; they are flagged here only so the forward map is complete.

> **Why mention GSIs now but define them in §8?** To keep §6 a complete map of the layout — a reader should leave this section knowing not just the four tables and their primary keys but also that a handful of alternate query paths exist — while still concentrating the precise index design (and its justification against ADR-001's "every index earns its place") in one dedicated section. _(See ADR-001.)_

---

## 7. Main Table — Item Definitions

**In plain terms:** This section is the precise blueprint for every kind of record in the main `BeyondFolio` table — what each one is filed under (its `PK`), how it is labelled (its `SK`), and which pieces of information it carries. A business reader can skim the in plain terms line under each item and the plain-English purpose column; a developer building the system reads the exact key shapes and attribute tables. Everything here implements the layout sketched in §6 and the decisions recorded in §5 — nothing new is introduced without an access pattern (§4) and an ADR behind it.

A few conventions used throughout this section. **`PK`** is the partition key (the "folder" an item is filed under) and **`SK`** is the sort key (the "filing label" within that folder), as established in §6.2. Identifiers shown as `u_123`, `t_789`, etc. are illustrative placeholders, not a prescribed ID format. In the attribute tables, the **Denorm?** column flags an attribute that is a _denormalized_ copy — a deliberate duplicate of data that primarily lives on another item, stored here so a common read needs no extra look-up (ADR-004); when such a copied value can change, every copy must be kept in step. Attributes marked _(key)_ are part of the primary key, not separate stored fields.

> **Why spell out every item's key and attributes?** Because in a type-overloaded single table (§6.3), an item's key _is_ its contract — it determines what queries can find it and which other items it sits beside. Writing the keys down precisely is what lets §12 prove that every access pattern (AP-1 … AP-34) is served. _(See ADR-001.)_

### 7.1 User

**In plain terms:** The root record for a person — their profile and settings. Everything else a user owns is filed in the same folder beneath it.

- **`PK`** = `USER#<userId>`
- **`SK`** = `PROFILE` (a single fixed label, because there is exactly one profile item per user)

| Attribute     | Type   | Purpose                                                                                                     | Denorm? |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------- | ------- |
| `PK` _(key)_  | String | `USER#<userId>` — the user's folder; the root of all their data (ADR-002)                                   | —       |
| `SK` _(key)_  | String | `PROFILE` — marks this as the user's root/profile item                                                      | —       |
| `entityType`  | String | `"User"` — self-identifies the item (§6.3)                                                                  | —       |
| `userId`      | String | The user's stable id (also embedded in `PK`)                                                                | —       |
| `email`       | String | Login / contact address (provider-supplied, e.g. from Google)                                               | —       |
| `displayName` | String | Name shown in the UI (provider-supplied)                                                                    | —       |
| `role`        | String | `"user"` or `"admin"` — **managed by Beyond Folio** (not provider-supplied); defaults to `"user"` (ADR-013) | —       |
| `createdAt`   | String | ISO-8601 timestamp of account creation (first sign-in)                                                      | —       |
| `settings`    | Map    | User preferences (free-form)                                                                                | —       |

> **Why a fixed `SK = PROFILE` rather than repeating the id?** The user item is a singleton in its own partition, so a constant label makes the fetch trivial (`PK = USER#<userId>`, `SK = PROFILE`) and keeps the profile distinct from the many other item types that share the partition. _(Serves AP-1, AP-2; see ADR-002.)_

> **Where does `userId` come from?** It is **our own internal id**, minted when the user first signs in and mapped from their identity-provider subject id via the **AuthIdentity** lookup item (§7.12). It is _not_ the provider's `sub` directly — using our own id lets a single user link multiple providers later (Google + Zerodha, Phase 2) without changing their `userId` (ADR-013, ADR-002). The `userId` always comes from the verified session, never from an uploaded file.

> **No password is stored here.** Authentication is via **self-managed OAuth 2.0 / OIDC** — Beyond Folio never handles credentials (the identity provider does). This item holds only app-facing profile data (`email`, `displayName`, `role`, `createdAt`, `settings`). The `role` is **managed by us** so authorization checks read it directly from our data.

> **How this item gets created** — on the user's **first successful sign-in** (first-login provisioning): after the provider's token is verified, we mint a `userId` and write both this `User` item and the matching **AuthIdentity** item (§7.12), each with a "create-if-not-exists" guard (ADR-005). _(Serves AP-2, AP-2a; see ADR-013.)_

### 7.2 BrokerAccount

**In plain terms:** One brokerage account the user holds — e.g. their Fidelity account or their Zerodha account. It records which broker it is and which currency it trades in. In Phase 1 a user has **one account per broker** (all of that broker's activity from the uploaded single-account file sits under a single deterministic `accountId`); holding multiple accounts within one broker is a Phase-2 extension.

- **`PK`** = `USER#<userId>`
- **`SK`** = `ACCOUNT#<accountId>`

| Attribute     | Type   | Purpose                                                                              | Denorm? |
| ------------- | ------ | ------------------------------------------------------------------------------------ | ------- |
| `PK` _(key)_  | String | The owning user's folder                                                             | —       |
| `SK` _(key)_  | String | `ACCOUNT#<accountId>` — distinguishes this account within the user                   | —       |
| `entityType`  | String | `"BrokerAccount"`                                                                          | —       |
| `accountId`   | String | Deterministic per-`(user, broker)` id — `acc_rh` / `acc_fid` / `acc_zer`; found-or-created by `(userId, broker)` (§3.1, ADR-005/ADR-015) | —       |
| `broker`      | String | `"Robinhood"` / `"Fidelity"` / `"Zerodha"` (an attribute, not its own entity — §3.2) | —       |
| `currency`    | String | `"USD"` or `"INR"` — the account's native currency (ADR-007)                         | —       |
| `accountType` | String | **Optional** — set only when the file states it (e.g. Zerodha `"Individual"`); left unset for single-account Fidelity and Robinhood in Phase 1 — never guessed (D9) | —       |
| `displayName` | String | Friendly label for the UI                                                            | —       |
| `createdAt`   | String | When the account was first seen/created                                              | —       |

> **Why list accounts as items under the user rather than a separate table?** "List a user's accounts" (AP-3) becomes a single prefix query (`PK = USER#<userId>`, `SK begins_with ACCOUNT#`) with no cross-table hop, and the account sits beside the trades and cashflows that reference it. _(Serves AP-3, AP-4; see ADR-002, ADR-003.)_

### 7.3 ImportedFile

**In plain terms:** A record that a particular statement file has already been uploaded, identified by a fingerprint of its contents. Its sole job is to make a re-upload of the _same file_ a safe no-op (the first layer of dedup).

- **`PK`** = `USER#<userId>`
- **`SK`** = `FILE#<contentHash>`

| Attribute     | Type   | Purpose                                                                                                 | Denorm? |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------- | ------- |
| `PK` _(key)_  | String | The owning user's folder                                                                                | —       |
| `SK` _(key)_  | String | `FILE#<contentHash>` — the content fingerprint _is_ the identity, so the same file maps to the same key | —       |
| `entityType`  | String | `"ImportedFile"`                                                                                        | —       |
| `contentHash` | String | Hash (content fingerprint) of the uploaded file                                                         | —       |
| `broker`      | String | Which broker the file came from                                                                         | —       |
| `fileName`    | String | Original file name (for display)                                                                        | —       |
| `importedAt`  | String | When the import ran                                                                                     | —       |
| `status`      | String | Import lifecycle state — `UPLOADED` → `PROCESSING` → `PREVIEW_READY` → `COMMITTING` → `COMPLETE` (plus `FAILED` / `CANCELLED`); polled by the UI (TRD §2.5, §10.8) | —       |
| `summary`     | Map    | Counts of trades/cashflows created (for the import receipt)                                             | —       |
| `s3Key`       | String | Key of the retained raw file in S3 — **relative only** (`<userId>/<contentHash>`); the bucket is a single app-config value, never a full `s3://…` URL (ADR-016). Attached at Confirm when the raw file is promoted from temp to the permanent key     | —       |

> **Why make the content hash the key?** File-level dedup (§5.2) means "don't import the same file twice." If the key _is_ the file's fingerprint, **creating** it with a "only if it doesn't already exist" condition (`attribute_not_exists(PK)`) makes a duplicate upload fail harmlessly — no read-then-write race. This record is **created once at upload** (that create is the Layer-1 dedup gate) and then **updated through its `status` lifecycle** as the two-gate async import progresses (§10.8, TRD §2.5). The **`s3Key`** records where this file's original bytes were retained in S3 (ADR-016): the raw file is first staged in a temp location and, **on Confirm**, promoted to the permanent key `<userId>/<contentHash>` and recorded here — giving a clean one-file → one-permanent-object → one-record mirror (unconfirmed uploads are never promoted). _(Serves AP-5, AP-6; see ADR-005.)_

### 7.4 Trade

**In plain terms:** One buy or sell of a security — the unit of the unified history view. It is filed by date so history comes back newest-first, and its identity is derived from the facts that make a trade unique, so importing the same trade twice can't create a duplicate.

- **`PK`** = `USER#<userId>`
- **`SK`** = `TRADE#<tradeDate>#<tradeId>` (date in `YYYY-MM-DD` so it sorts chronologically as text — ADR-009)
- **`tradeId`** is a deterministic fingerprint of the trade's natural identity: `account + canonical symbol + datetime + side + quantity + price`, plus a **per-broker distinguisher** so two genuinely-distinct but identical-looking same-day rows don't collide — Zerodha uses its `brokerTradeId`, Fidelity its `cashBalance`, Robinhood a within-file `occurrence` index (D2, ADR-005).

| Attribute              | Type   | Purpose                                                                                                             | Denorm?            |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `PK` _(key)_           | String | The owning user's folder                                                                                            | —                  |
| `SK` _(key)_           | String | `TRADE#<tradeDate>#<tradeId>` — time-ordered, uniquely identified                                                   | —                  |
| `entityType`           | String | `"Trade"`                                                                                                           | —                  |
| `tradeId`              | String | Deterministic id from the trade's natural key (dedup)                                                               | —                  |
| `accountId`            | String | Which account the trade belongs to (also drives GSI1, §8)                                                           | Yes (from BrokerAccount) |
| `broker`               | String | Broker for display/filtering                                                                                        | Yes (from BrokerAccount) |
| `symbol`               | String | The **canonical** ticker after symbol resolution (ADR-010)                                                          | —                  |
| `rawSymbol`            | String | The symbol exactly as it appeared in the broker file (preserved as-imported)                                        | —                  |
| `side`                 | String | `"BUY"` or `"SELL"`                                                                                                 | —                  |
| `instrumentType`       | String | `"Stock"`, `"ETF"`, `"Option"`, `"IndexOption"`, `"MutualFund"`, etc. (§4 of FEATURES). In Phase 1 **all** options normalize to `"Option"`; distinguishing `"IndexOption"` (NIFTY/BANKNIFTY…) is a Phase-2 backfill (D10/OQ-T) | —                  |
| `quantity`             | Number | Units traded (supports fractional shares — §4)                                                                      | —                  |
| `price`                | Number | Per-unit price in the account's currency                                                                            | —                  |
| `currency`             | String | `"USD"` / `"INR"` (ADR-007)                                                                                         | Yes (from BrokerAccount) |
| `tradeDateTime`        | String | Full ISO-8601 execution timestamp (the date portion seeds the `SK`)                                                 | —                  |
| `optionDetails`        | Map    | `{underlying, right, strike, expiry}` (plus `contractMultiplier`/`lotSize` where the broker implies it) — present only for options; parsed per broker (Fidelity `Symbol` code / RH `Description` / Zerodha `symbol`+`expiry_date`), safe-failing on non-match (D10)   | —                  |
| `rawAction`            | String | The raw broker verb/code exactly as imported (RH `Trans Code`, Fidelity `Action`, Zerodha `trade_type`) — preserved for audit / future re-labelling (L8)              | —                  |
| `eventType`            | String | **Optional** — for non-trade **position events** only (`"ASSIGNMENT"`, `"EXPIRATION"`, `"MERGER"`, `"SPLIT"`, `"RECLASS"`); absent on ordinary buys/sells (D3)         | —                  |
| `securityId`           | String | **Optional** — stable security identifier where the file carries one: Zerodha `isin`, Robinhood CUSIP (from `Description`); **never fabricated** (absent on Fidelity, options, cash). Phase-2-facing (D8) | —                  |
| `securityIdType`       | String | **Optional** — `"CUSIP"` or `"ISIN"`, identifying which scheme `securityId` uses (D8)                                | —                  |
| `occurrence`           | Number | **Optional (Robinhood only)** — within-file occurrence index `#N` among identical same-day rows; the RH dedup distinguisher folded into `tradeId` (D2)               | —                  |
| `brokerTradeId`        | String | **Optional (Zerodha only)** — the broker's own unique `trade_id`; the Zerodha dedup distinguisher folded into `tradeId` (D2)                                          | —                  |
| `GSI1PK` _(index key)_ | String | `USER#<userId>#BROKER#<broker>` — puts this trade into GSI1 (trades-by-broker, §8.1). Present on every Trade.     | —                  |
| `GSI1SK` _(index key)_ | String | `TRADE#<tradeDate>#<tradeId>` — time-orders the trade within GSI1                                                   | —                  |
| `GSI3PK` _(index key)_ | String | `USER#<userId>#SYM#<canonicalSymbol>` — puts this trade into GSI3 (trades-by-ticker, §8.3). Present on every Trade. | —                  |
| `GSI3SK` _(index key)_ | String | `TRADE#<tradeDate>#<tradeId>` — time-orders the trade within GSI3                                                   | —                  |

> **Why build the date and a deterministic id into the trade's `SK`?** The date gives time-ordered history straight from the query (ADR-009), and deriving `tradeId` from the trade's natural identity makes trade-level dedup a conditional write rather than a fragile read-then-write (ADR-005). Storing both the canonical `symbol` and the original `rawSymbol` keeps the as-imported record intact while still letting history and pricing follow symbol changes (ADR-010). _(Serves AP-8, AP-12; with GSI1 also AP-11; see ADR-005, ADR-009, ADR-010.)_

### 7.5 Cashflow

**In plain terms:** One movement of money with a date — a deposit, withdrawal, dividend, fee, or the cash side of a buy/sell. These are exactly what the rate-of-return (XIRR) calculation consumes, and they are filed by currency first, then date, so the calculation can read one currency's timeline in order in a single query.

- **`PK`** = `USER#<userId>`
- **`SK`** = `CASHFLOW#<currency>#<cashflowDate>#<cashflowId>`

| Attribute        | Type   | Purpose                                                                            | Denorm?            |
| ---------------- | ------ | ---------------------------------------------------------------------------------- | ------------------ |
| `PK` _(key)_     | String | The owning user's folder                                                           | —                  |
| `SK` _(key)_     | String | `CASHFLOW#<currency>#<date>#<cashflowId>` — currency-grouped, then time-ordered    | —                  |
| `entityType`     | String | `"Cashflow"`                                                                       | —                  |
| `cashflowId`     | String | Deterministic id from the movement's natural key (`account + type + currency + date + amount`) plus the same **per-broker distinguisher** as Trade — Zerodha id / Fidelity `cashBalance` / Robinhood `occurrence` (D2, ADR-005) | —                  |
| `cashflowType`   | String | One of 10 (D4): `"BUY"`, `"SELL"`, `"DEPOSIT"`, `"WITHDRAWAL"`, `"DIVIDEND"`, `"INTEREST"`, `"INCOME"`, `"FEE"`, `"ROYALTY"`, `"ADJUSTMENT"` (raw broker code always kept in `rawAction`) | —                  |
| `amount`         | Number | Signed amount in the native currency (sign convention covered in §10)              | —                  |
| `currency`       | String | `"USD"` / `"INR"` — also the first `SK` segment (ADR-007)                          | —                  |
| `accountId`      | String | Which account the money moved in                                                   | Yes (from BrokerAccount) |
| `cashflowDate`   | String | `YYYY-MM-DD` of the movement (seeds the `SK`)                                      | —                  |
| `relatedTradeId` | String | For `BUY`/`SELL`, links back to the Trade record this is the cash leg of (ADR-011) | Yes (from Trade)   |
| `symbol`         | String | Canonical symbol, when the movement relates to a security (dividends, buys, sells) | Yes                |
| `includeInXIRR`  | Boolean | Whether this cashflow counts in the per-currency XIRR timeline (AP-13): `true` for real money crossing the portfolio boundary; `false` for stored-but-excluded rows (e.g. SPAXX money-market sweeps, RSU-tax adjustments) (D1/D4) | —                  |
| `cashBalance`    | Number | **Optional (Fidelity only)** — the running `Cash Balance` column; the Fidelity dedup distinguisher folded into `cashflowId` (D2)                | —                  |
| `rawAction`      | String | The raw broker verb/code exactly as imported — preserved for audit / future re-labelling (L8)                       | —                  |

> **Why put currency _before_ the date in the cashflow `SK`?** Because XIRR is computed per currency with no conversion (ADR-007), and the timeline must be date-ordered (ADR-009). Grouping by currency first means "all USD cashflows in date order" is a single prefix query (`PK = USER#<userId>`, `SK begins_with CASHFLOW#USD#`) — one currency's complete timeline, already sorted, no separate index needed. A buy/sell produces _both_ this Cashflow and a Trade (§7.4), each written once (ADR-011, ADR-005). _(Serves AP-9, AP-13; see ADR-007, ADR-009, ADR-011.)_

### 7.6 JournalEntry

**In plain terms:** One journal note attached to a trade — free-text thoughts plus a prediction, and (after evaluation) a result. A trade can have many entries. Entries are filed _underneath_ their trade so listing "all notes on this trade" is one query, and each entry carries a copy of its tag names and the trade's symbol/currency so showing the entry needs no extra look-ups.

- **`PK`** = `USER#<userId>`
- **`SK`** = `TRADE#<tradeId>#JOURNAL#<entryId>` (nested beneath the trade — ADR-004)

| Attribute         | Type   | Purpose                                                                              | Denorm?          |
| ----------------- | ------ | ------------------------------------------------------------------------------------ | ---------------- |
| `PK` _(key)_      | String | The owning user's folder                                                             | —                |
| `SK` _(key)_      | String | `TRADE#<tradeId>#JOURNAL#<entryId>` — nests the entry under its trade                | —                |
| `entityType`      | String | `"JournalEntry"`                                                                     | —                |
| `entryId`         | String | Stable id for the entry                                                              | —                |
| `tradeId`         | String | The trade this entry belongs to                                                      | —                |
| `note`            | String | Free-form text (§5.5)                                                                | —                |
| `prediction`      | String | `"BULLISH"`, `"BEARISH"`, or `"NEUTRAL"` (§5.5)                                      | —                |
| `tagNames`        | List   | The names of the tags attached to this entry — a copy for one-read display (ADR-004) | Yes (from Tag)   |
| `symbol`          | String | Canonical symbol of the parent trade (so evaluation/display needs no trade re-read)  | Yes (from Trade) |
| `currency`        | String | Currency of the parent trade                                                         | Yes (from Trade) |
| `evaluation`      | String | `"WIN"`, `"LOSS"`, `"BREAKEVEN"`, or absent if not yet evaluated (§5.6)              | —                |
| `evaluatedAt`     | String | When it was evaluated (absent until then)                                            | —                |
| `evaluationPrice` | Number | The current price used at evaluation time (audit of the §5.6 decision)               | —                |
| `createdAt`       | String | When the entry was written                                                           | —                |

> **Why nest the entry under its trade and copy the tag names onto it?** Nesting makes "list all entries for this trade" (AP-15) a single prefix query (`SK begins_with TRADE#<tradeId>#JOURNAL#`), expressing the relationship through data locality rather than a join (ADR-004). Copying `tagNames` onto the entry means "fetch this entry with its tags" (AP-17) is one read, not one-per-tag — at the small cost of keeping the copy in step when tags are attached/removed. _(Serves AP-15, AP-16, AP-17, AP-22; see ADR-004.)_

### 7.7 Tag

**In plain terms:** A label the user invents — like "swing trade" or "Money Control" — that they attach to journal entries. The tag's name is its identity, so creating the same tag twice just lands on the same record.

- **`PK`** = `USER#<userId>`
- **`SK`** = `TAG#<tagName>`

| Attribute    | Type   | Purpose                                       | Denorm? |
| ------------ | ------ | --------------------------------------------- | ------- |
| `PK` _(key)_ | String | The owning user's folder                      | —       |
| `SK` _(key)_ | String | `TAG#<tagName>` — the name is the natural key | —       |
| `entityType` | String | `"Tag"`                                       | —       |
| `tagName`    | String | The user-defined label (also in `SK`)         | —       |
| `createdAt`  | String | When the tag was first created                | —       |

> **Why use the tag name as its key?** Tags are user-defined and referenced by name everywhere (on entries, links, and the scorecard), so name-as-key makes "create this tag" idempotent (AP-19) — writing it with `attribute_not_exists` simply no-ops if it already exists — and lets links and scorecards reference a tag without a separate id lookup. The accepted trade-off is that renaming a tag is non-trivial (it would touch the copies); Phase 1 treats tag names as stable. _(Serves AP-18, AP-19; see ADR-005.)_

### 7.8 JournalEntry↔Tag Link

**In plain terms:** The connector that records "this tag is on this entry." Because a journal entry can have many tags and a tag can be on many entries (a many-to-many relationship), we store a tiny link record for each pairing. The entry already carries its own tag names for display; these link records exist so we can also go the other way — "which entries have this tag?" — which the scorecard view needs.

- **`PK`** = `USER#<userId>`
- **`SK`** = `JTAG#<tagName>#<entryId>`
- Also carries **GSI2** keys (defined in §8) so the relationship can be read tag-first.

| Attribute    | Type   | Purpose                                                                    | Denorm?                 |
| ------------ | ------ | -------------------------------------------------------------------------- | ----------------------- |
| `PK` _(key)_ | String | The owning user's folder                                                   | —                       |
| `SK` _(key)_ | String | `JTAG#<tagName>#<entryId>` — one item per (tag, entry) pairing             | —                       |
| `entityType` | String | `"JournalTagLink"`                                                         | —                       |
| `tagName`    | String | The tag in the pairing                                                     | —                       |
| `entryId`    | String | The journal entry in the pairing                                           | —                       |
| `tradeId`    | String | The trade the entry belongs to (so the entry can be fetched from the link) | Yes (from JournalEntry) |
| `GSI2PK`     | String | `USER#<userId>#TAG#<tagName>` — groups all entries for one tag (§8)        | —                       |
| `GSI2SK`     | String | `JOURNAL#<entryId>` — identifies the entry within that tag group           | —                       |

> **Why a link item _and_ tag names copied onto the entry?** They serve opposite directions of the same many-to-many relationship. The `tagNames` copy on the entry (§7.6) answers entry→tags in one read (AP-17); the link item — read tag-first via GSI2 — answers tag→entries (AP-21), which the scorecard view (§5.7) relies on. Putting `tagName` first in the link's `SK` also makes "remove all links for a tag" or "list links for a tag within the user" a clean prefix operation. _(Serves AP-20, AP-21; see ADR-004.)_

### 7.9 TagScorecard

**In plain terms:** The running win/loss tally for one tag — the numbers behind "which of my sources actually call it right?" It is kept as live counters that tick up by one whenever an entry carrying that tag is evaluated, so reading a track record is instant.

- **`PK`** = `USER#<userId>`
- **`SK`** = `TAGSCORE#<tagName>`

| Attribute    | Type   | Purpose                                                       | Denorm? |
| ------------ | ------ | ------------------------------------------------------------- | ------- |
| `PK` _(key)_ | String | The owning user's folder                                      | —       |
| `SK` _(key)_ | String | `TAGSCORE#<tagName>` — one scorecard per tag                  | —       |
| `entityType` | String | `"TagScorecard"`                                              | —       |
| `tagName`    | String | The tag this scorecard belongs to                             | —       |
| `wins`       | Number | Running count of `WIN` evaluations (atomic counter — ADR-006) | —       |
| `losses`     | Number | Running count of `LOSS` evaluations (atomic counter)          | —       |
| `breakeven`  | Number | Running count of `BREAKEVEN` evaluations (atomic counter)     | —       |
| `updatedAt`  | String | When the tally last changed                                   | —       |

> **Why a dedicated counter item per tag instead of counting entries on demand?** The scorecard is read often (to rank sources — AP-24, AP-25) and must stay correct under simultaneous evaluations. Keeping `wins`/`losses`/`breakeven` as counters bumped with an atomic "add one" (`ADD` in `UpdateItem`) makes the read O(1) and the update concurrency-safe — two evaluations at once both count, with neither overwriting the other (ADR-006). Because the counter _is_ the official tally, any re-evaluation must adjust it deliberately. _(Serves AP-23, AP-24, AP-25; see ADR-006.)_

### 7.10 SymbolMapping (Global / Admin-Owned)

**In plain terms:** The one shared, admin-maintained list of ticker-symbol changes (e.g. FB→META). It is the single record type **not** filed under a user — it lives in its own global folder because it is the same market fact for everyone (the deliberate exception of ADR-012).

- **`PK`** = `GLOBAL#SYMBOLMAP`
- **`SK`** = `SYMBOL#<broker>#<rawSymbol>` (keyed by what a broker file might contain, so resolution is a direct look-up)

| Attribute         | Type   | Purpose                                                                    | Denorm? |
| ----------------- | ------ | -------------------------------------------------------------------------- | ------- |
| `PK` _(key)_      | String | `GLOBAL#SYMBOLMAP` — the shared, admin-owned partition (ADR-012)           | —       |
| `SK` _(key)_      | String | `SYMBOL#<broker>#<rawSymbol>` — the old/raw symbol to resolve from         | —       |
| `entityType`      | String | `"SymbolMapping"`                                                          | —       |
| `broker`          | String | The broker context the raw symbol came from                                | —       |
| `rawSymbol`       | String | The old or as-filed symbol                                                 | —       |
| `canonicalSymbol` | String | The current equivalent the raw symbol resolves to                          | —       |
| `effectiveDate`   | String | When the change took effect (for context)                                  | —       |
| `source`          | String | `"auto"` (detected on import) or `"admin"` (manually set/corrected) — §5.9 | —       |
| `updatedAt`       | String | When the mapping was last set                                              | —       |

> **Why is this the only item not rooted at a user, and why still in the main table?** A ticker change is a market-wide fact maintained by an admin (§5.9), so per-user copies would be wrong and wasteful — one shared partition means an admin's correction applies to everyone at once (ADR-012). It stays in the main table (rather than its own) because it is durable and long-lived like the rest of the data and is easily isolated by its distinct `GLOBAL#SYMBOLMAP` partition; only the shared _and_ ephemeral price cache earns a separate table (ADR-003). Keying by `(broker, rawSymbol)` makes "resolve this symbol" a direct `GetItem`. _(Serves AP-26, AP-27; see ADR-010, ADR-012, ADR-003.)_

### 7.11 Item-Type Summary

| Item type             | `PK`                            | `SK`                                      | Primary APs                |
| --------------------- | ------------------------------- | ----------------------------------------- | -------------------------- |
| User                  | `USER#<userId>`                 | `PROFILE`                                 | AP-1, AP-2                 |
| BrokerAccount         | `USER#<userId>`                 | `ACCOUNT#<accountId>`                     | AP-3, AP-4                 |
| ImportedFile          | `USER#<userId>`                 | `FILE#<contentHash>`                      | AP-5, AP-6                 |
| Trade                 | `USER#<userId>`                 | `TRADE#<date>#<tradeId>`                  | AP-8, AP-10, AP-12         |
| Cashflow              | `USER#<userId>`                 | `CASHFLOW#<currency>#<date>#<cashflowId>` | AP-9, AP-13                |
| JournalEntry          | `USER#<userId>`                 | `TRADE#<tradeId>#JOURNAL#<entryId>`       | AP-15, AP-16, AP-17, AP-22 |
| Tag                   | `USER#<userId>`                 | `TAG#<tagName>`                           | AP-18, AP-19               |
| JournalEntry↔Tag link | `USER#<userId>`                 | `JTAG#<tagName>#<entryId>`                | AP-20, AP-21               |
| TagScorecard          | `USER#<userId>`                 | `TAGSCORE#<tagName>`                      | AP-23, AP-24, AP-25        |
| SymbolMapping         | `GLOBAL#SYMBOLMAP`              | `SYMBOL#<broker>#<rawSymbol>`             | AP-26, AP-27               |
| AuthIdentity          | `AUTH#<provider>#<providerSub>` | `AUTH`                                    | AP-2b, AP-2c               |
| BrokerMapper          | `GLOBAL#BROKERMAPPER`           | `MAPPER#<fileType>`                       | AP-33, AP-34               |

_Note on "current holdings" (AP-14): there is intentionally **no** Holdings item. The symbols and quantities a user still holds are **derived** by reading their Trade records, because a live holdings/positions view is explicitly out of scope (§1.5). This keeps the model from carrying a speculative entity (ADR-001); the derivation is described in §10._

### 7.12 AuthIdentity (Login Lookup — Provider Identity → userId)

**In plain terms:** A tiny "pointer" record used only at sign-in. When a user logs in with Google, the identity provider gives us their stable Google id (`sub`), but our data is filed under _our own_ `userId`. This item is the translation: it maps `(provider, providerSub) → userId`, so a returning user is resolved to the same account every time. It is the one record type — alongside the global SymbolMapping — that is **not** rooted under a user (it can't be: at login we don't yet know the `userId`; that's exactly what this item tells us).

- **`PK`** = `AUTH#<provider>#<providerSub>` (e.g. `AUTH#google#114872…`)
- **`SK`** = `AUTH` (a single fixed label; there is exactly one pointer per provider identity)

| Attribute     | Type   | Purpose                                                                                                                                                                            | Denorm? |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `PK` _(key)_  | String | `AUTH#<provider>#<providerSub>` — the external identity being resolved                                                                                                             | —       |
| `SK` _(key)_  | String | `AUTH` — fixed label                                                                                                                                                               | —       |
| `entityType`  | String | `"AuthIdentity"` — self-identifies the item (§6.3)                                                                                                                                 | —       |
| `provider`    | String | Which identity provider this login came from — `"google"` (available in Phase 1). Phase 2 **adds** `"zerodha"` as a second provider **alongside** Google (Google is not replaced). | —       |
| `providerSub` | String | The provider's **stable** subject id for this user (Google `sub`, etc.)                                                                                                            | —       |
| `userId`      | String | Our internal `userId` this identity maps to                                                                                                                                        | —       |
| `createdAt`   | String | When this identity was first linked (first sign-in)                                                                                                                                | —       |

> **Why a lookup item rather than a GSI on the User?** At login we only have the provider's `sub`, not our `userId`, so we need `(provider, sub) → userId`. A tiny lookup item makes that a **direct `GetItem`** by the exact key (the cheapest read), and writing it with `attribute_not_exists` enforces "one account per provider identity" atomically — the same idempotency pattern the whole model uses (ADR-005). It also makes **Phase-2 account-linking** trivial: a user who later adds Zerodha simply gets a _second_ AuthIdentity item (`AUTH#zerodha#…`) pointing at the _same_ `userId`. A GSI on the User item can't enforce uniqueness and represents multiple provider identities on one item awkwardly. _(Serves AP-2b, AP-2c; see ADR-013, ADR-005, ADR-012.)_

> **Login flow:** verify the provider's token → read `sub` → `GetItem AUTH#<provider>#<sub>`. If present → use its `userId` (returning user). If absent → first login: mint a new `userId`, then write both the `User` profile (§7.1) and this AuthIdentity item, each guarded by `attribute_not_exists` (ADR-005). This is what resolves **OQ-D** toward first-login provisioning.

### 7.13 BrokerMapper (Global / Admin-Owned)

**In plain terms:** The admin-maintained "recipe" for reading one broker file type — which raw column means what, how to interpret each row, and a fingerprint of the file's header so the app can recognize it on upload. Like SymbolMapping, it is a shared, admin-owned record **not** filed under any user (the second deliberate exception to per-user rooting — ADR-015, ADR-012). Beyond Folio ships all four pre-seeded before launch; ordinary users never edit it.

- **`PK`** = `GLOBAL#BROKERMAPPER`
- **`SK`** = `MAPPER#<fileType>` (one mapper per file type — `ROBINHOOD_ACTIVITIES`, `FIDELITY_SINGLE_ACC_ACTIVITY`, `ZERODHA_EQUITY`, `ZERODHA_FO`)

| Attribute          | Type   | Purpose                                                                                                                     | Denorm? |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| `PK` _(key)_       | String | `GLOBAL#BROKERMAPPER` — the shared, admin-owned partition (ADR-015, ADR-012)                                               | —       |
| `SK` _(key)_       | String | `MAPPER#<fileType>` — identifies which broker file type this mapper reads                                                   | —       |
| `entityType`       | String | `"BrokerMapper"`                                                                                                            | —       |
| `fileType`         | String | `"ROBINHOOD_ACTIVITIES"` / `"FIDELITY_SINGLE_ACC_ACTIVITY"` / `"ZERODHA_EQUITY"` / `"ZERODHA_FO"`                                       | —       |
| `broker`           | String | `"Robinhood"` / `"Fidelity"` / `"Zerodha"` — which broker this file type belongs to                                         | —       |
| `headerFingerprint`| String | The ordered, normalized (lowercased/trimmed) header column names joined (optionally hashed) — matched on upload to auto-detect broker + file type (AP-33); no match → hard stop (L2/L3) | —       |
| `columnMapping`    | Map    | How each raw column becomes a normalized field, via exactly **four rule kinds**: **`direct`** (copy through), **`lookup`** (raw code → normalized value via a table), **`classify`** (interpret free text, e.g. Fidelity `Action`), **`extract`** (pull sub-fields from one column, e.g. the option-symbol parsers) (ADR-015) | —       |
| `version`          | Number | Mapper version; an admin bump signals a corrected/updated mapper (corrections are forward-only in Phase 1 — L9/OQ-M)        | —       |
| `updatedAt`        | String | When the mapper was last set by an admin                                                                                    | —       |

> **Why is BrokerMapper global/admin-owned, and why in the main table?** A broker's file format is a fact about the outside world, identical for every user and curated only by an admin (§5.1/§5.9) — so per-user copies would be wrong, and one shared partition means an admin's fix applies to everyone at once (ADR-015, same pattern as SymbolMapping/ADR-012). It stays in the main table because it is durable, long-lived config, isolated by its distinct `GLOBAL#BROKERMAPPER` partition; only the shared _and_ ephemeral price cache earns a separate table (ADR-003). On upload the app matches a file's header to a mapper's `headerFingerprint` (AP-33, a direct key read); an admin creates / updates / **deletes** a mapper (AP-34) — both by the item's own key, so neither needs a GSI. _(Serves AP-33, AP-34; see ADR-015, ADR-012, ADR-003.)_

---

## 8. Global Secondary Indexes (GSIs)

**In plain terms:** Most questions the app asks are answered directly by how items are filed in §7 — under a user, labelled by type and date. A few questions, though, need to find records by something _other_ than that main filing order. For those we add a **Global Secondary Index (GSI)** — an automatically-maintained alternate "filing system" over the same data that supports one extra way to look things up. This section defines the minimum set of GSIs Beyond Folio needs, and — just as importantly — records which questions need _no_ GSI, so we are not paying for indexes we don't use.

A GSI re-files the same items under a different key (`GSInPK` / `GSInSK`) and DynamoDB keeps it in sync automatically as items change. Only items that have those `GSInPK`/`GSInSK` attributes appear in the index (this is called a _sparse_ index — sparse meaning "only the relevant items are present, the rest are simply absent"), which is exactly what we want: each index contains only the item types it is meant to serve. Each index also chooses a **projection** — which attributes are copied into the index — trading index size against how often a match still needs a follow-up read of the full item.

> **Why keep the GSI set minimal and justify each one?** Every GSI costs extra storage and extra write work (each relevant write updates the index too), so under access-pattern-first an index must earn its place by serving a real query that the base table can't answer efficiently (ADR-001). We add exactly three — two for the core Phase 1 reads (GSI1, GSI2) and one for ticker filtering (GSI3, AP-30). _(See ADR-001, ADR-002.)_

### 8.1 GSI1 — Trades by Broker

**In plain terms:** Lets the app show "just the trades in _this one broker_", newest first — without scanning the user's whole combined history and filtering.

- **`GSI1PK`** = `USER#<userId>#BROKER#<broker>`
- **`GSI1SK`** = `TRADE#<tradeDate>#<tradeId>` (same time-ordering as the base table — ADR-009)
- **Populated by:** Trade items only (they alone carry these attributes — a sparse index).
- **Projection:** the trade attributes needed to render a history row (symbol, side, quantity, price, currency, dates); `ALL` is acceptable for Phase 1 if simpler.
- **Serves:** AP-11 (list a user's trades filtered to one broker).

| Attribute | Value                            | Purpose                                                                  |
| --------- | -------------------------------- | ------------------------------------------------------------------------ |
| `GSI1PK`  | `USER#<userId>#BROKER#<broker>` | Groups one broker's trades together, still scoped to the user (ADR-002) |
| `GSI1SK`  | `TRADE#<tradeDate>#<tradeId>`    | Time-orders that broker's trades (ADR-009)                              |

> **Why an index for by-broker but not for unified history?** Unified history across _all_ brokers (AP-10) is already a base-table prefix query (`PK = USER#<userId>`, `SK begins_with TRADE#`, read in reverse for newest-first) — no index needed. Filtering to _one_ broker (AP-11) is the case the base table can't do efficiently, because broker isn't part of the trade's base `SK`; so GSI1 re-files trades by broker. Keeping `userId` inside `GSI1PK` ensures isolation survives into the index (ADR-002). In Phase 1 each user has **one account per broker**, so “by broker” and “by account” coincide; multiple accounts within one broker is a Phase-2 extension. _(Serves AP-11; see ADR-001, ADR-002, ADR-009, ADR-015.)_

### 8.2 GSI2 — Journal Entries by Tag

**In plain terms:** Lets the app answer "show me every journal entry tagged _Money Control_" — the reverse of the tags-on-an-entry view — which is what the source scorecard view builds on.

- **`GSI2PK`** = `USER#<userId>#TAG#<tagName>`
- **`GSI2SK`** = `JOURNAL#<entryId>`
- **Populated by:** JournalEntry↔Tag link items (§7.8) — a sparse index containing only the link items.
- **Projection:** keys plus `tradeId` and `entryId`, enough to locate and fetch each entry (`KEYS_ONLY` or a small `INCLUDE` projection).
- **Serves:** AP-21 (list journal entries associated with a given tag).

| Attribute | Value                         | Purpose                                                           |
| --------- | ----------------------------- | ----------------------------------------------------------------- |
| `GSI2PK`  | `USER#<userId>#TAG#<tagName>` | Groups all entries carrying one tag, scoped to the user (ADR-002) |
| `GSI2SK`  | `JOURNAL#<entryId>`           | Identifies each entry within the tag group                        |

> **Why index the link items rather than the entries directly?** A journal entry can carry several tags, so "entries for a tag" is the many-to-many reverse lookup (§7.8). The link items are the natural carrier of that relationship; re-filing them by `(user, tag)` turns AP-21 into a single index query, and the projection carries just enough to fetch each full entry when needed. As with GSI1, `userId` stays in the partition key so one user's tag view can never surface another user's entries (ADR-002). _(Serves AP-21; see ADR-004, ADR-002.)_

### 8.3 GSI3 — Trades by Ticker

**In plain terms:** Lets the app show "just the trades for _this one ticker_" (e.g. all of a user's AAPL trades), newest first — without reading the user's whole trade history and filtering it down.

- **`GSI3PK`** = `USER#<userId>#SYM#<canonicalSymbol>`
- **`GSI3SK`** = `TRADE#<tradeDate>#<tradeId>` (same time-ordering as the base table — ADR-009)
- **Populated by:** Trade items only (they alone carry these attributes — a sparse index). Keyed on the **canonical** symbol (ADR-010) so a corporate-action rename (FB→META) doesn't split a ticker's history across old and new symbols.
- **Projection:** the trade attributes needed to render a history row (side, quantity, price, currency, dates, `accountId`); `ALL` is acceptable for Phase 1 if simpler.
- **Serves:** AP-30 (list a user's trades filtered to one ticker).

| Attribute | Value                                 | Purpose                                                                 |
| --------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `GSI3PK`  | `USER#<userId>#SYM#<canonicalSymbol>` | Groups one ticker's trades together, still scoped to the user (ADR-002) |
| `GSI3SK`  | `TRADE#<tradeDate>#<tradeId>`         | Time-orders that ticker's trades (ADR-009)                              |

> **Why index by ticker at all — the base table can already filter?** Without this index, "trades for one ticker" (AP-30) is a base-table `Query` on `SK begins_with TRADE#` plus a `FilterExpression` on `symbol` — which reads _all_ of the user's trades and discards non-matches (paying to read them). At Phase 1 volumes that filter approach is perfectly acceptable and cheap; GSI3 is added so the read stays _indexed_ (reads only the matching ticker's trades) as history grows, and because ticker-filtering is a known, wanted query — so it earns a key (ADR-001). Keying on the **canonical** symbol keeps a renamed ticker's history unified (ADR-010); `userId` stays in the partition key to preserve isolation (ADR-002). _(Serves AP-30; see ADR-001, ADR-002, ADR-009, ADR-010.)_

> **Note (Trade item carries GSI3 keys).** For a Trade to appear in this index, its item (§7.4) also carries `GSI3PK = USER#<userId>#SYM#<canonicalSymbol>` and `GSI3SK = TRADE#<tradeDate>#<tradeId>`. These are stamped at import time alongside the trade's other attributes.

### 8.4 Access Patterns That Need No GSI

To show the GSI set is complete _and_ minimal, the table below records the read patterns served entirely by the base table's primary key — no index required.

| AP    | How the base table serves it                                                                   |
| ----- | ---------------------------------------------------------------------------------------------- |
| AP-1  | `GetItem` `PK = USER#<userId>`, `SK = PROFILE`                                                 |
| AP-3  | Query `PK = USER#<userId>`, `SK begins_with ACCOUNT#`                                          |
| AP-5  | `GetItem` `PK = USER#<userId>`, `SK = FILE#<contentHash>`                                      |
| AP-10 | Query `PK = USER#<userId>`, `SK begins_with TRADE#`, reverse for newest-first                  |
| AP-12 | Query `PK = USER#<userId>`, `SK begins_with TRADE#<date>#<tradeId>` (or by known date)         |
| AP-13 | Query `PK = USER#<userId>`, `SK begins_with CASHFLOW#<currency>#` — one currency, date-ordered |
| AP-15 | Query `PK = USER#<userId>`, `SK begins_with TRADE#<tradeId>#JOURNAL#`                          |
| AP-17 | `GetItem` the entry (its `tagNames` are denormalized on it — §7.6)                             |
| AP-18 | Query `PK = USER#<userId>`, `SK begins_with TAG#`                                              |
| AP-24 | `GetItem` `PK = USER#<userId>`, `SK = TAGSCORE#<tagName>`                                      |
| AP-25 | Query `PK = USER#<userId>`, `SK begins_with TAGSCORE#`                                         |
| AP-26 | `GetItem` `PK = GLOBAL#SYMBOLMAP`, `SK = SYMBOL#<broker>#<rawSymbol>`                          |
| AP-28 | `GetItem` on the price-cache table (§9)                                                        |

> **Why does the base table cover so much on its own?** Because the key shapes in §7 were chosen _for_ these patterns — currency-then-date cashflow keys (AP-13), trade-nested journal keys (AP-15), tag-names copied onto entries (AP-17). That is access-pattern-first paying off: the more the primary keys are shaped around real queries, the fewer secondary indexes are needed. The remaining write/derive patterns (AP-2, AP-4, AP-6, AP-7, AP-8, AP-9, AP-14, AP-16, AP-19, AP-20, AP-22, AP-23, AP-27, AP-29) are covered by writes to the items above or, for AP-14, by deriving holdings from trades (§10). _(See ADR-001, ADR-009.)_

---

## 9. Auxiliary Table — Price Cache

**In plain terms:** Everything in §7–§8 lives in the one main `BeyondFolio` table. This section defines the **auxiliary tables** — small, separate stores that sit alongside the main table. The primary one (§9.1–§9.6) is the price cache; a second auxiliary store, the sessions table for auth refresh tokens (§9.7), is introduced by the TRD and only summarized here. The price cache exists for one job: when Beyond Folio needs a current price (to value a portfolio for the rate-of-return figure, or to judge a prediction Win/Loss), it first looks here; if a recent-enough price is on hand it reuses it, and only otherwise calls out to an external market-data service and saves the fresh price here for the next look-up. A business reader can stop at that sentence; a developer reads on for the exact key and the auto-expiry rule. This table is deliberately kept apart from the main table because cached prices behave unlike everything else: they are **shared** by all users (one price for a symbol serves everyone) and **ephemeral** (they are meant to live only briefly), so giving them their own home keeps short-lived shared data from cluttering the durable, per-user store (ADR-003).

> **Why a whole separate table for prices instead of a partition in the main one?** Two reasons that both point the same way. First, prices are shared market facts, not any one user's data, so they don't belong under a `USER#<userId>` folder. Second, they should auto-expire, and DynamoDB's automatic expiry (TTL) is configured per table on a single timestamp attribute — keeping that fast-churning, expiring data out of the durable store keeps the main table clean and its items permanent. _(See ADR-003, ADR-008.)_

### 9.1 Purpose & Lifecycle

The price cache is a **global, ephemeral key-value store**: give it a symbol (and the currency it trades in) and it returns the latest price someone fetched recently, or nothing if no fresh price is on hand. It is global because a stock's price is the same fact for every user — caching it once and sharing it avoids every user (and every valuation) triggering its own external look-up of the same symbol (§5.8). It is ephemeral because a cached price is only trustworthy for a short while; once it ages out it should simply disappear rather than be served stale (ADR-008). The cache is therefore never a _system of record_ — it is purely a speed-and-cost optimization in front of the external market-data services, and it can be emptied at any time with no loss of durable data (the next read just re-fetches).

### 9.2 Key Shape & Attributes

A price cache is a pure look-up — "what is the current price of this symbol?" — so the key is a single partition key and there is **no sort key**: there is no within-symbol range or ordering a cache needs to scan. Because the same ticker can trade in two different currency markets (for example a US listing quoted in USD vs an Indian listing quoted in INR — §3 spans both USD and INR markets), the key includes the **currency** to disambiguate, and it is keyed by the **canonical** symbol — the current, post-resolution ticker (ADR-010) — so a look-up made after a symbol change still lands on the right entry. Currency (not exchange) is used because the broker statement files Beyond Folio ingests reliably carry the account currency but do **not** all carry the exchange — only Zerodha names the exchange, while Robinhood and Fidelity do not — so currency is the disambiguator the data can actually populate, and it is also the axis the market-data provider is routed on (INR → Kite, USD → the US provider). See §13 for the accepted NSE/BSE same-currency limitation.

- **Table:** the auxiliary price-cache table (separate from `BeyondFolio`).
- **`PK`** = `PRICE#<canonicalSymbol>#<currency>` (e.g. `PRICE#META#USD`, `PRICE#INFY#INR`)
- **No `SK`** — each symbol-in-a-currency is a single cached item, addressed directly.

| Attribute         | Type   | Purpose                                                                                  | Notes                                           |
| ----------------- | ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `PK` _(key)_      | String | `PRICE#<canonicalSymbol>#<currency>` — the symbol-and-currency this price is for         | The canonical symbol (ADR-010)                  |
| `entityType`      | String | `"PriceCache"` — self-identifies the item (§6.3)                                         | —                                               |
| `canonicalSymbol` | String | The resolved ticker the price is for                                                     | —                                               |
| `price`           | Number | The latest fetched price                                                                 | —                                               |
| `currency`        | String | `"USD"` / `"INR"` — the currency the price is quoted in, and the key disambiguator (ADR-007) | Also the second key segment                 |
| `asOf`            | String | ISO-8601 timestamp of when the price was fetched from the source                         | Used for the freshness check (§9.4)             |
| `expiresAt`       | Number | **TTL** attribute — epoch seconds after which DynamoDB may auto-delete the item          | The table's TTL is configured on this attribute |

> **Why a single partition key with the currency baked in, and keyed by the canonical symbol?** A cache's only question is "give me the price for this symbol in this currency," which is a direct `GetItem` — a sort key would add nothing because there is no range to scan within a symbol. Folding the currency into the key prevents a same-named ticker in two currency markets (e.g. a USD listing vs an INR listing) from colliding on one entry — and, crucially, currency is a field every ingested trade already carries (unlike exchange, which only Zerodha supplies). Keying by the _canonical_ symbol means resolution (ADR-010) happens once, before the look-up, so a corporate-action rename (FB→META) doesn't fragment the cache across old and new tickers. _(Serves AP-28, AP-29; see ADR-003, ADR-008, ADR-010.)_

### 9.3 The TTL Attribute & Automatic Expiry

The cache relies on **TTL** (Time To Live — a DynamoDB feature where the database automatically deletes an item once a set time has passed, with no clean-up code or scheduled job to run). The table's TTL is configured to watch the **`expiresAt`** attribute, which holds an **epoch-seconds** timestamp (the integer format DynamoDB's TTL requires). When a price is written, `expiresAt` is set to "now + the cache window" (the short reuse period from §5.8 — a configuration value, not a fixed part of the data model). Once that moment passes, the item becomes eligible for automatic deletion and the cache naturally shrinks back toward only the symbols in active use. This makes "fetch fresh, reuse briefly, then forget" a property of the data itself rather than something the application has to manage (ADR-008).

> **Why store the expiry on the item instead of clearing the cache on a timer?** Because automatic per-item expiry is exactly the "short-lived" behavior §5.8 describes, and it costs nothing to operate — no cron job, no sweep, no extra service. Each price carries its own deadline; the database enforces it. _(See ADR-008.)_

### 9.4 Read Rule — Treat Expired-but-Not-Yet-Deleted as Missing

One caveat of TTL matters at read time: **automatic deletion is not instantaneous.** DynamoDB guarantees an expired item _will_ be removed, but it may linger for a short period past its `expiresAt` before the background process actually deletes it. So the application must **not** assume that "the item is still here" means "the price is still fresh." On every read (AP-28), after fetching the item the code compares its freshness — `expiresAt` (or `asOf` plus the cache window) against the current time — and if the price is past its window it is **treated as missing**: ignored, and a fresh price fetched from the external service and written back (AP-29). The freshness decision lives in the application's read logic; TTL is only the janitor that eventually clears the stale item away.

> **Why double-check freshness in code when TTL already deletes stale prices?** Because TTL deletion lags — an expired-but-not-yet-purged price could otherwise be served as if current, which would mis-value a portfolio or mis-judge a Win/Loss. Treating anything past its window as absent makes correctness depend on the timestamp we control, not on deletion timing we don't. _(Serves AP-28; see ADR-008.)_

### 9.5 Serving the Price Access Patterns

| AP                                                                     | Operation                                                        | How it works                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AP-28** — get the cached current price for a symbol (if still fresh) | `GetItem` on `PK = PRICE#<canonicalSymbol>#<currency>`           | Resolve the symbol to canonical first (ADR-010), then a direct key read. Apply the §9.4 freshness check; if absent or stale, fall through to AP-29.                                                         |
| **AP-29** — store a freshly fetched price with a short TTL             | `PutItem` of the price item with `expiresAt = now + cacheWindow` | Writes (or overwrites) the single entry for that symbol-on-market; the new `expiresAt` resets the reuse window. A plain overwrite is correct here — the latest fetched price simply replaces the prior one. |

> **Why is the cache write a plain overwrite rather than a conditional, idempotent write like the rest of the model?** Because, unlike imports (where a duplicate must be prevented, ADR-005), re-writing a price is _desirable_ — the newest fetch should win and refresh the window. The cache has no dedup requirement and no durability obligation; last-write-wins is exactly the behavior we want. _(Serves AP-28, AP-29; see ADR-008.)_

### 9.6 Historical Price Series Cache (for the Trade Chart)

**In plain terms:** The trade price chart (`FEATURES.md` §5.12, FR-H5) needs a ticker's **historical price line** — many past prices over a range — which the current-price cache (§9.1–§9.5, one _latest_ value per symbol) does not hold. This subsection defines a **second kind of cache item** for that job: one row holding a whole daily series for a `(canonicalSymbol, currency)`, fetched lazily the first time a user opens that ticker's chart and reused for the rest of the day. It is a **sibling of the current-price cache** — same principles (global, ephemeral, TTL-expiring, not a system of record — ADR-008), just a different shape (a series instead of a single price) and a longer freshness window (~1 day instead of minutes).

- **Home:** the same auxiliary price-cache table (it is cache data with the same lifecycle), told apart from current-price items by its `PK` prefix and `entityType`. _(Keeping it in the auxiliary table — not the main `BeyondFolio` table — follows ADR-003/ADR-008: it is shared, ephemeral, and TTL-driven, exactly like the current-price cache.)_
- **`PK`** = `PRICEHIST#<canonicalSymbol>#<currency>` (e.g. `PRICEHIST#AAPL#USD`) — distinct prefix from the `PRICE#…` current-price items so the two never collide.
- **No `SK`** — one item holds the whole series for that symbol-in-a-currency.

| Attribute         | Type   | Purpose                                                                                          | Notes                                                              |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `PK` _(key)_      | String | `PRICEHIST#<canonicalSymbol>#<currency>` — the symbol-and-currency this series is for            | Canonical symbol (ADR-010)                                         |
| `entityType`      | String | `"PriceHistory"` — self-identifies the item (§6.3)                                               | —                                                                  |
| `canonicalSymbol` | String | The resolved ticker the series is for                                                            | —                                                                  |
| `currency`        | String | `"USD"` / `"INR"` — the currency the series is quoted in, and the key disambiguator (ADR-007)     | Also the second key segment                                        |
| `series`          | List   | The daily price points (e.g. `[{ "d": "2026-01-02", "c": 185.12 }, …]`) — the chart's line       | ~1 year of daily closes                                            |
| `fetchedDate`     | String | `YYYY-MM-DD` (source-market date) the series was last fetched — drives the 1-day freshness check | —                                                                  |
| `expiresAt`       | Number | **TTL** attribute — epoch seconds after which DynamoDB may auto-delete the item                  | Set a few days out; the freshness check (not TTL) governs re-fetch |

**Lazy fetch + 1-day freshness (this is AP-31/AP-32).** When a user opens an equity trade's chart:

1. **Read** the `PRICEHIST#<canonicalSymbol>#<currency>` item (AP-31). If it exists **and** its `fetchedDate` is **today**, serve the stored `series` — no external call (this is what collapses many same-day viewers of the same ticker into a single upstream fetch).
2. If it is **absent or `fetchedDate` is an earlier day** (stale), fetch a fresh series from the external market-data service, **overwrite** the item with the new `series` and today's `fetchedDate` (AP-32), and serve it. Like the current-price cache, this write is a plain **last-write-wins overwrite** — the newest series should win (ADR-008).

> **Why a separate item shape (and prefix) rather than reusing the current-price cache?** The two answer different questions — "what is the price _now_?" (a single value, minutes-fresh) vs. "how did the price move _over the last year_?" (a whole series, day-fresh) — and have different freshness windows. Giving the historical series its own `PRICEHIST#…` prefix keeps each look-up a clean direct read and lets the two coexist in one auxiliary table without interfering. It stays an ephemeral, TTL-backed cache (never a system of record), so it can be dropped and re-fetched at any time. _(Serves AP-31, AP-32; see ADR-003, ADR-008, ADR-010, ADR-014.)_

> **Why a ~1-day freshness window (reuse if fetched today)?** Daily price data only gains a new point once per trading day, so re-fetching more often would return the same series. Reusing a series fetched **today** eliminates duplicate upstream calls when several users open the same ticker on the same day (the cost win of ADR-014), while re-fetching on the **first view of a new day** keeps the chart current. The freshness decision lives in the read logic (comparing `fetchedDate` to today); TTL is only the eventual janitor that clears series nobody looks at anymore. _(See ADR-014, ADR-008.)_

### 9.7 Sessions Table (Auth Refresh Tokens) — owned by the TRD

**In plain terms:** A third table — separate from the main store and the price cache — holds authentication **refresh tokens** (the long-lived half of the hybrid session model). It is introduced by the TRD's auth design, not by the original access-pattern analysis, so it is **defined in full there**; this subsection only records its existence and placement so the data-model layout stays complete.

- **Home:** a dedicated **sessions table** (a second auxiliary table alongside the price cache). It is **not** in the main `BeyondFolio` table — for the same ephemeral/TTL reason as the price cache, **plus** least-privilege credential isolation (only the auth code path is granted IAM access, so no other component that reads the main table can reach session credentials). See ADR-003 (second purposeful exception).
- **Lifecycle:** ephemeral — refresh tokens carry a TTL `expiresAt` (auto-expire), and are deleted on logout ("log out everywhere" = delete all of a user's session items).
- **Access:** hit only on refresh/logout (the short-lived access token is verified by signature with no lookup), so the table sees very little traffic.
- **Full definition:** key shape, attributes, rotation/revocation, and the browser cookie handling are specified in [`TRD.md`](./TRD.md) §5.2–§5.4 and §7.1 (this data model defers to the TRD as the owner of this table).

> **Why is this table's definition in the TRD, not here?** This data model was designed access-pattern-first from `FEATURES.md`, which has no session concept; sessions are an implementation concern of the self-managed OAuth decision (ADR-013), settled in the TRD. Recording it here (rather than fully specifying it) keeps the two documents consistent without duplicating a definition that the TRD owns. _(See ADR-003, ADR-008, ADR-013; TRD §5.4/§7.1.)_

---

### 9.8 Waitlist Table (Launch-Gating) — **TEMPORARY**

**In plain terms:** A fourth table holds the **email waitlist** collected on the public landing page while Beyond Folio is invite-gated at launch. It is deliberately **temporary scaffolding**, not part of the durable domain model: once the app is fully live and open signup is enabled, the waitlist feature is removed — the table and its `POST /waitlist` endpoint are retired, and Google sign-in becomes the direct entry point. It is documented here only so the physical table count (four) is complete and unambiguous; it is **not** access-pattern-derived from `FEATURES.md` (it is launch/operations scope introduced by the backlog, `PHASE_1_BACKLOG.md` E1/E2).

- **Home:** a dedicated **waitlist table**, separate from everything else. It holds no user-owned domain data and is never joined to the main store.
- **`PK`** = `email` (the sign-up email is the natural identity; a repeat submission of the same email is an idempotent overwrite).
- **No `SK`** — one item per email.

| Attribute   | Type   | Purpose                                                        | Notes                          |
| ----------- | ------ | ------------------------------------------------------------- | ------------------------------ |
| `email` _(key)_ | String | The waitlisted email address                               | Natural identity               |
| `joinedAt`  | String | ISO-8601 timestamp the email was submitted                    | —                              |
| `source`    | String | Optional origin tag (e.g. landing-page campaign)              | Optional                       |

- **Ownership / lifecycle:** global (not per-user), **on-demand** capacity, no TTL — entries persist for the launch period, then the whole table is decommissioned at full launch.
- **Access:** written by the public `POST /waitlist` endpoint (rate-limited, `PHASE_1_BACKLOG.md` E2); read only for launch operations. Not reachable from any authenticated user access pattern.
- **Retirement:** at full launch, the table, its endpoint, and the landing-page waitlist form are removed together. No migration is needed — the data is operational, not domain state.

> **Why keep the waitlist out of the main table and mark it temporary?** Because it is short-lived launch scaffolding with a global (non-user) shape and no relationship to any user-owned item — folding it into the durable per-user store would leave a dead partition to clean up later. A standalone table can simply be dropped when open signup goes live. _(See ADR-003; `PHASE_1_BACKLOG.md` E1/E2.)_

---

## 10. Handling the Tricky Requirements

**In plain terms:** The earlier sections defined the records and how they're filed. This section steps back and shows how those pieces work _together_ to satisfy the genuinely hard requirements in `FEATURES.md` — the ones that usually trip up a data model: never importing the same thing twice, computing an honest rate of return, keeping two currencies and many accounts apart, tracking which information sources actually call it right, and coping with ticker symbols that change over time. Each subsection states the requirement in plain terms, then walks through the mechanism using the items from §7–§9. Where a requirement also exposes a known Phase 1 gap, it is flagged and carried forward to §13.

### 10.1 Two-Layer Deduplication

**Requirement (§5.2):** re-uploading the **same file** must not import it twice, and overlapping uploads must not record the **same trade** (or cash movement) twice — so users can safely re-upload.

The model handles this with **two independent layers, both built on deterministic keys + conditional writes** (ADR-005), so dedup is a property of _how the write is attempted_, never a fragile "read first, then decide" step that two simultaneous imports could both slip through.

- **Layer 1 — file level (ImportedFile, §7.3).** Before processing, the importer computes a content fingerprint (a hash) of the uploaded file's bytes and tries to write an `ImportedFile` item whose key _is_ that fingerprint (`SK = FILE#<contentHash>`) with the condition `attribute_not_exists(PK)` — meaning "only create this if it isn't already here." A re-upload of the identical file produces the identical key, the condition fails, and the whole import is a safe no-op (AP-5, AP-6).
- **Layer 2 — record level (Trade, §7.4 and Cashflow, §7.5).** Even when two _different_ files overlap (e.g. an updated statement that repeats last month's trades), individual records must not double up. Each Trade's `tradeId` is a deterministic fingerprint of its natural identity — account + canonical symbol + date/time + side + quantity + price — and each Cashflow's `cashflowId` is likewise derived from its natural identity (account + type + currency + date + amount). Writing each with `attribute_not_exists` means a repeated trade or cash movement resolves to the same key and the second write simply no-ops.
- **Why the natural key alone isn't enough — a per-broker distinguisher (D2).** Robinhood and Fidelity give **date-only** activity (no execution clock time) and **no broker trade-id**, so two genuinely-distinct but identical-looking same-day rows (same symbol, side, quantity, price — common with options) would compute the _same_ fingerprint and the second real row would be silently dropped. Each broker's fingerprint therefore folds in a distinguisher that makes true duplicates match while keeping distinct rows apart: **Zerodha** uses its stable, unique **`brokerTradeId`** (`trade_id`); **Fidelity** uses the row's running **`cashBalance`** (differs per row); **Robinhood** uses a within-file **`occurrence` index `#N`** — a tally of "which copy am I among rows with this exact identity in _this_ file" (1, 2, 3…, always appended, not the file line number). A true re-upload recomputes the same `#N` and still collides (idempotent); a genuinely new copy gets the next `#N` and imports. _(These are the `brokerTradeId` / `cashBalance` / `occurrence` attributes on §7.4 and §7.5.)_

Because a buy/sell creates _both_ a Trade and a Cashflow (ADR-011), the importer writes both under their own deterministic keys, each guarded by its own condition, so neither view can end up with a duplicate or a half-written pair.

> **Why two layers instead of just one?** They catch different failures. The file hash cheaply short-circuits the common case (the exact same file re-uploaded) without parsing anything. The per-record keys catch the harder case the file hash can't — the _same trade_ arriving inside a _different_ file. Together they make re-uploading completely safe (§5.2). _(See ADR-005, ADR-011.)_

> **Known limitation carried to §13 (narrowed by D2):** the per-broker distinguisher closes the common same-file case, so the only residual is **Robinhood-specific** — two genuinely-distinct, identical-looking same-day rows that are **never present together in a single uploaded file** (e.g. split across separately-filtered exports). Such a second row recomputes `#1`, collides, and is missed. Any single file that lists both copies captures both. This is a much smaller accepted Phase 1 trade-off of identity-by-natural-key; logged in §13 (OQ-A).

### 10.2 XIRR Assembly — Per-Currency Timeline + Derived Holdings

**Requirement (§5.4):** compute a true rate of return that accounts for the timing of every deposit, withdrawal, buy, sell, dividend, and fee — **plus the current value of what the user still holds** — and do it per currency, with no conversion (§5.10, ADR-007).

XIRR needs two inputs, and the model assembles both without any new entity:

1. **The dated, signed cashflow series — read straight from the base table.** All money movements are Cashflow items keyed `CASHFLOW#<currency>#<date>#<cashflowId>` (§7.5), so "every USD movement in date order" is a single prefix query (`PK = USER#<userId>`, `SK begins_with CASHFLOW#USD#`) — already grouped by currency and already sorted by date (AP-13, ADR-009). INR is the same query with the `INR` prefix. No conversion, no merging — each currency is solved on its own (ADR-007).
2. **The terminal valuation cashflow — derived from Trade records + the price cache.** Because there is intentionally **no Holdings item** (a live positions view is out of scope, §1.5, §7.11), the user's current holdings are **derived** on demand: read the user's trades (`SK begins_with TRADE#`, AP-10), net buys against sells per canonical symbol to get the quantity still held, then value each remaining position using the current price from the price-cache table (§9, resolving symbols via ADR-010). The summed market value, dated _today_, becomes the final cashflow in the series.

**Sign convention (this resolves the deferral noted in §7.5).** Cashflow `amount` is stored signed from the **investor's perspective**: money _leaving the user to be invested_ is **negative**, money _returning to the user_ is **positive**.

| Cashflow type                           | Sign         | Rationale                                                                           |
| --------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `DEPOSIT`                               | **negative** | Cash the user puts into the portfolio (an outflow from their pocket into investing) |
| `BUY`                                   | **negative** | Cash spent acquiring a security                                                     |
| `FEE`                                   | **negative** | Cash paid out in charges                                                            |
| `WITHDRAWAL`                            | **positive** | Cash taken back out of the portfolio                                                |
| `SELL`                                  | **positive** | Cash received from disposing of a security                                          |
| `DIVIDEND`                              | **positive** | Cash received from a holding                                                        |
| _Terminal holdings valuation (derived)_ | **positive** | The current value of what's still held, treated as if liquidated today              |

With that one consistent convention, a currency's series is fed directly to an XIRR solver (the rate that makes the net present value of the signed, dated series equal zero) — the data model stores the signed amounts and dates; the calculation itself is application logic.

> **Why derive holdings instead of storing them?** A stored holdings/positions view is explicitly out of scope (§1.5), and inventing one would be a speculative entity that access-pattern-first forbids (ADR-001). Trades already contain everything needed to net out the current position, and prices come from the cache (§9) — so the terminal valuation is computed when XIRR runs, keeping the model lean and avoiding a second copy of position data to keep in sync. _(Serves AP-13, AP-14; see ADR-007, ADR-009, ADR-001.)_

> **Open question carried to §13:** dividend-reinvestment (DRIP) reporting varies by broker and isn't yet confirmed (`FEATURES.md` §7), which affects exactly which Cashflow/Trade records a reinvested dividend produces. Logged in §13.

### 10.3 Per-Broker & Multi-Currency Isolation

**Requirement (§5.10):** one user may hold accounts at several brokers, spanning US Dollars and Indian Rupees, and the two currencies must never be blended. (Phase 1 keeps one account per broker; multiple accounts within one broker is a Phase-2 extension.)

The model keeps these separations structural rather than computed-at-read:

- **Per-broker.** Each BrokerAccount is its own item under the user (§7.2), and every Trade and Cashflow carries its `accountId` **and** `broker` (denormalized from the account). Unified history across _all_ brokers is the base-table `TRADE#` prefix (AP-10); filtering to _one_ broker is **GSI1** (`GSI1PK = USER#<userId>#BROKER#<broker>`, §8.1, AP-11). A user with both a Robinhood and a Fidelity account sees them combined or one broker at a time, with no cross-broker leakage. (Phase 1 = one account per broker; multiple accounts within one broker is Phase 2.)
- **Multi-currency.** Currency is the **first segment of every Cashflow's sort key** (`CASHFLOW#<currency>#...`, §7.5) and is stamped on Trades too. That makes each currency's timeline a separate prefix query, so XIRR is computed once per currency and the two are never summed (§10.2, ADR-007). A user with both USD and INR activity simply gets two rate-of-return figures.

> **Why is currency in the key rather than just a filter on a flag?** Because every per-currency read (especially the XIRR timeline, AP-13) wants _one_ currency's movements in date order, and putting currency first in the sort key delivers exactly that slice from the base table — no scan-and-filter, and no chance of accidentally mixing currencies into one calculation. _(See ADR-007, ADR-009.)_

### 10.4 Many-to-Many Journal↔Tags & the Evaluation→Scorecard Flow

**Requirement (§5.5–§5.7):** a trade can have many journal entries; an entry can carry many tags; evaluating an entry marks it Win/Loss/Breakeven and updates each of its tags' running track record.

This combines three §7 items working in concert:

- **Entry→tags in one read (§7.6).** Each JournalEntry carries its `tagNames` as a denormalized copy, so displaying an entry with its tags is a single read (AP-17, ADR-004).
- **Tag→entries via link items + GSI2 (§7.8, §8.2).** For the reverse direction the scorecard view needs — "every entry tagged _Money Control_" — a small link item per (tag, entry) pairing is re-filed by `(user, tag)` on GSI2, turning AP-21 into one index query.
- **Evaluation→atomic counters (§7.9, §5.6).** When the user clicks **Evaluate** (AP-22), the app: resolves the trade's canonical symbol (ADR-010), reads the current price from the cache (§9), decides WIN/LOSS/BREAKEVEN, writes that `evaluation` (and `evaluatedAt`, `evaluationPrice`) onto the entry, then — for **each** tag on the entry — bumps the matching counter on that tag's TagScorecard with an atomic "add one" (`ADD` in `UpdateItem`, AP-23). Reading a track record (AP-24/AP-25) is then an instant counter read.

> **Why an atomic counter bump per tag rather than recomputing the scorecard from entries each time?** Because the scorecard is read often and must stay correct even if two evaluations happen at once — an atomic add credits both without either overwriting the other (ADR-006), and the read stays O(1) as history grows. The trade-off is that the counter _is_ the official tally, so a future re-evaluation must adjust it deliberately. _(Serves AP-22, AP-23, AP-24, AP-25; see ADR-004, ADR-006, ADR-010.)_

### 10.5 Corporate-Action Symbol Resolution

**Requirement (§5.9):** when a ticker changes (e.g. FB→META), old symbols must still be recognized as their current equivalent, so history, valuation, and evaluation all stay accurate and consistent.

Resolution leans on the single shared, admin-owned SymbolMapping list (§7.10, the deliberate global exception of ADR-012) and is applied at the three moments that matter (ADR-010):

- **At import.** As trades and cashflows are parsed, each raw broker symbol is resolved against `GLOBAL#SYMBOLMAP` (`GetItem` on `SYMBOL#<broker>#<rawSymbol>`, AP-26) and stored as the canonical `symbol`, while the original is preserved as `rawSymbol` (§7.4) — the as-imported record stays intact, but history groups under the current ticker. Newly observed changes can be auto-added, and an admin can add or correct mappings (AP-27).
- **At valuation.** When deriving holdings for XIRR (§10.2), positions are netted under the canonical symbol and priced from the cache keyed by that canonical symbol (§9), so a rename never splits a position or misses a price.
- **At evaluation.** The Evaluate flow (§10.4) prices the trade using its canonical symbol, so a prediction is judged against the right current quote.

> **Why resolve at read/use time against one shared list instead of rewriting old trades when a symbol changes?** Rewriting in place would destroy the original as-imported record and is risky to apply across history; consulting one shared list at the moments that matter keeps the raw record intact while still presenting the current equivalent everywhere — and an admin's single correction applies to every user at once (ADR-012). _(Serves AP-26, AP-27; see ADR-010, ADR-012.)_

### 10.6 Known Limitations the Model Inherits (→ §13)

Being honest about the edges, three `FEATURES.md` items surface directly in this data model and are carried forward to §13 (Open Questions & Assumptions):

| Limitation / open question                                  | Where it bites in the model                                                                                                                                       | Disposition                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Identical same-day Robinhood transfers** (§7 of FEATURES) | Two transfers of the same amount on the same day derive the same `cashflowId` (§10.1) and collapse to one record                                                  | Accepted Phase 1 limitation — a rare case; the cost of identity-by-natural-key (ADR-005). Logged in §13.       |
| **Zerodha F&O open vs. close ambiguity** (§7 of FEATURES)   | The broker file doesn't say whether an F&O trade opens or closes a position; affects how a Trade's intent is recorded and how positions net for valuation (§10.2) | Open question — resolution (e.g. an execution-ordered position tracker) is still being decided. Logged in §13. |
| **Dividend-reinvestment (DRIP) reporting** (§7 of FEATURES) | Unclear which Cashflow/Trade records a reinvested dividend should produce, affecting the XIRR series (§10.2)                                                      | Open question — needs verification against real broker files. Logged in §13.                                   |

> **Why surface limitations inside the data-model doc rather than hide them?** Because a model is only trustworthy if its known soft spots are explicit. Each item above is a direct consequence of a deliberate modeling choice (deterministic keys, derived holdings) or of upstream broker-file ambiguity; recording them here — and forwarding them to §13 — keeps the design honest and gives the next contributor a precise list of what to revisit. _(See ADR-005; §13.)_

### 10.7 The Trade Price Chart — Markers from Trades + a Cached Price Line

**Requirement (`FEATURES.md` §5.12, FR-H5):** opening an **equity** trade (Stock/ETF) shows a chart of that ticker's historical price with a **marker at each of the user's buy/sell transactions** on it (green circle = buy, red circle = sell); hovering a marker shows type, date, price, quantity.

The chart is assembled from two pieces — one we already have, one small new cache — with **no new durable item type** (ADR-014):

1. **The markers — reuse existing Trade records.** The chart is scoped to the opened trade's **canonical symbol + market/currency**. The app reads the user's trades for that symbol via **GSI3** (AP-30, `GSI3PK = USER#<userId>#SYM#<canonicalSymbol>`) and keeps those matching the opened trade's `currency`/exchange (so a dual-listed ticker never mixes an INR listing with a USD one on a single price line). Each surviving Trade is one marker at its `price`/`tradeDateTime`, coloured by `side` (BUY → green, SELL → red). Because GSI3 is `userId`-scoped, markers span **all of the user's accounts** for that ticker while staying private (ADR-002). N transactions → N markers.
2. **The price line — the historical-series cache (§9.6).** For the opened trade's `(canonicalSymbol, currency)`, read the `PRICEHIST#…` item (AP-31); if its `fetchedDate` is today, use it, otherwise re-fetch once and overwrite (AP-32). The series is drawn as the chart's background line, in the same currency as the markers.

**Instrument gating.** The chart is rendered only for **Stock** and **ETF** `instrumentType`s. Options, index options, and mutual/money-market/401k funds show the trade detail with a "price chart isn't available for this instrument type" note instead — they have no meaningful continuous price line to plot markers against.

> **Why do markers need no new stored data?** They _are_ the user's Trade records, already indexed by ticker for AP-30 (GSI3). The chart just reads that index, filters to the opened trade's currency/market in app code (trivial at Phase-1 volumes), and colours by `side` — honoring "no speculative entity" (ADR-001). The only genuinely new data is the price line, which is the ephemeral §9.6 cache. **Phase 1 shows only factual buy/sell markers — no computed profit/loss;** realized P/L on sell markers (needing a cost-basis method) is deferred to Phase 2 (ADR-014, OQ-E). _(Serves FR-H5 via AP-30/AP-31/AP-32; see ADR-014, ADR-010.)_

### 10.8 Import Pipeline: Detection, Dedup & Raw-File Capture

**Requirement (§5.1, §5.2):** a user uploads a broker file and Beyond Folio must recognize it, avoid importing anything twice, let the user review and confirm what will be added, and keep the original file for later. The mechanism is a fixed pipeline whose order is deliberate — never fully process a file or row that a cheaper earlier check can reject (ADR-015, ADR-016, ADR-005).

> **Two-gate, asynchronous flow (refined in [`TRD.md`](./TRD.md) §2.3).** The pipeline runs as **two user gates** around **asynchronous** work, rather than one synchronous confirmation. The user first uploads and clicks **Proceed to Import** (Gate 1); the heavy parse/dedup/normalize runs in the background and produces a preview; the user reviews it and clicks **Confirm** (Gate 2); the write then runs in the background. This decouples the heavy work from the user's connection and lets the user confirm the **interpreted (normalized) result** before anything is written. The `ImportedFile` record is **created once at upload** (its creation is the Layer-1 dedup gate) and **updated through a status lifecycle** — `UPLOADED → PROCESSING → PREVIEW_READY → COMMITTING → COMPLETE` (plus `FAILED` / `CANCELLED`); see §7.3 and TRD §2.5.

The stages run in this order:

1. **Layer-1 file-hash dedup (§10.1).** Compute a SHA-256 over the uploaded file's raw bytes and **create the `ImportedFile`** record keyed `FILE#<contentHash>` with `attribute_not_exists`, at `status=UPLOADED`. An identical re-upload short-circuits here as a safe no-op — nothing is parsed (AP-5/AP-6).
2. **Detect the broker + file type by header fingerprint (AP-33).** The normalized, ordered header column names are matched against the pre-seeded BrokerMappers (§7.13). This resolves broker _and_ file type at once — no broker dropdown, and Zerodha equity-vs-F&O self-resolves (the F&O header carries `expiry_date`) (L2). **If no mapper matches, the import hard-stops** with a "this file doesn't match our internal formats — contact support" message (L3): because users can't edit mappers, a broker format change is an admin action (update the mapper — the user retries). The message distinguishes a **recognized-but-changed** broker from a **wholly unrecognized** file (D9 Q5). **A third, specific case:** a **multi-account (combined) Fidelity export** — recognizable by its account-identifying columns (`Account` / `Account Number`), which the single-account mapper (`FIDELITY_SINGLE_ACC_ACTIVITY`) does not carry — is **not supported in Phase 1** and hard-stops with a **tailored message**: _"This looks like a multi-account Fidelity export, which isn't supported yet — please download and upload an individual-account file."_ (Multi-account support is Phase 2; see §7.2/§11.3.)
3. **Stage the raw file (temp).** The original pre-parse bytes are uploaded **directly to a temporary S3 location** (a `temp/` prefix), via a pre-signed URL so the bytes never transit the backend (TRD §7.2, §9.5). They are **promoted to the permanent key only on Confirm** (stage 7); abandoned uploads auto-expire from `temp/` and are never promoted.

   **— Gate 1: the user clicks _Proceed to Import_ →** stages 4–6 run **asynchronously** (`status=PROCESSING`); the user may leave and return.
4. **Resolve the account — find-or-create by `(userId, broker)`.** The deterministic `accountId` (`acc_rh`/`acc_fid`/`acc_zer`) is written with a conditional put, so a first import creates the BrokerAccount and every later one reuses it; Zerodha's two files both resolve to `acc_zer` (§3.1, D9, ADR-005).
5. **Minimal parse + Layer-2 record dedup (§10.1), then full normalization of NEW rows only (§10.9).** Parse the identity fields, compute each `tradeId`/`cashflowId` (with its per-broker distinguisher), and check existence — producing the **counts** (ready-to-import / duplicate / skipped-unsupported). Only rows that pass Layer-2 are then run through the per-broker normalization — the deliberate optimization of never fully normalizing a row that's already a known duplicate (L4). The **normalized batch is parked** in the temp S3 area alongside the raw file, and the record is set to `status=PREVIEW_READY`.
6. **Preview → the user reviews.** The user sees the **counts** plus the **normalized rows that will be imported** and the **skipped/unsupported rows** (so they see exactly what will and won't be recorded, and how each row was interpreted). It is **read-only** — there is no edit button in Phase 1 (L5).

   **— Gate 2: the user clicks _Confirm_ →** stage 7 runs **asynchronously** (`status=COMMITTING`).
7. **Confirm → write, in order (D14/ADR-016).** On confirm: **(a) promote the raw file** from the temp location to the permanent key `<userId>/<contentHash>`; **(b) update the `ImportedFile`** record with that `s3Key`; **(c) write the Trades/Cashflows** from the parked normalized batch, each guarded by `attribute_not_exists` (Layer-2 re-enforced at write); then delete the temp artifacts and set `status=COMPLETE`. This yields a clean one-file → one-permanent-S3-object → one-`ImportedFile` mirror; files that hard-stopped, or that the user never confirmed, are **never promoted** to the permanent key.

**Forward-only correction (L9/OQ-M).** If a mapper is later found wrong and an admin corrects it, Phase 1 does **not** retroactively reprocess already-imported rows; the retained raw files (ADR-016) are what a Phase-2 re-import engine will use. The correction applies to subsequent imports only.

> **Why this exact order?** Each stage is cheaper than the one after it and can reject work early: the file hash avoids parsing a known file; fingerprint detection avoids normalizing an unrecognized one; Layer-2 avoids normalizing known-duplicate rows; and the temp-then-promote write order guarantees no _permanently-retained_ record ever lacks its source file while never keeping the bytes of an unconfirmed import. The two async gates keep the heavy work off the user's connection and let them confirm the interpreted result before any durable write. _(Serves AP-5, AP-6, AP-33; see ADR-005, ADR-015, ADR-016; TRD §2.3–§2.6.)_

### 10.9 Normalization: Per-Broker Row Interpretation

**Requirement (§5.1):** turn each broker's idiosyncratic raw row into Beyond Folio's normalized Trade and Cashflow attributes — consistently, and without ever silently mis-recording a row it can't confidently read. The BrokerMapper (§7.13) drives this; the raw verb/code is always preserved in `rawAction` (L8), and any row that can't be parsed with confidence **safe-fails** to a flagged/skipped row rather than a wrong guess.

**The four `columnMapping` kinds (ADR-015)** do the column-level translation: **`direct`** (copy a column through, e.g. Zerodha `isin` → `securityId`), **`lookup`** (map a clean code to a normalized value, e.g. Robinhood `Trans Code` / Zerodha `trade_type`), **`classify`** (interpret free text — the Fidelity `Action` word-set matcher), and **`extract`** (pull sub-fields from one column — the option-symbol parsers and the Robinhood CUSIP/`Description` rule).

The normalization rules, all grounded in the real broker files:

- **Transaction-type catalogue (D1 → the 10-value `cashflowType`, D4).** Every raw label maps to a normalized category, to **SKIP** (not imported), or to **EVENT** (a non-cash position event). Robinhood/Zerodha use clean codes (`lookup`); Fidelity's free-text `Action` uses the **`classify` word-set matcher** (validated against every Action row, no ties/unmapped). The exact broker code is always retained in `rawAction`, so a coarse enum loses no detail.
- **Fidelity verb specifics (D9).** `REINVESTMENT` → a **BUY** (labelled "DRIP"); `Contributions` → **BUY** (`MutualFund`, underlying from `Description`); `Transfers` (qty/amt 0) → inert **EVENT**; `TRANSFERRED…TO BROKERAGE OPTION` → internal transfer, **excluded** from XIRR; `Electronic Funds Transfer Received/Paid` → **DEPOSIT/WITHDRAWAL** (D5); **SPAXX/FDRXX money-market sweeps** → stored but hidden, `includeInXIRR=false`.
- **Position events (D3).** `ASSIGNMENT`/`EXPIRATION`/`MERGER`/`SPLIT`/`RECLASS` rows set `eventType` and are inert (no cash effect); an assignment appears as two rows — the amount-0 option leg (EVENT) plus the real-cash share row (ordinary BUY/SELL).
- **Fee handling (L7).** Fidelity trade `Amount` is already **net** of commission/fees (kept as display metadata, not double-counted); Robinhood trades are fee-free, but its `GOLD`/`AFEE`/`DTAX` rows become their own **FEE** cashflows; Zerodha tradebooks carry no fees, so INR XIRR is fee-exclusive in Phase 1 (OQ-I).
- **Option parsers (D10).** Per broker: Fidelity parses the `Symbol` code, Robinhood the `Description`, Zerodha the `symbol` plus the `expiry_date` column (strike isolated by stripping the expiry-derived token). All produce the same `optionDetails = {underlying, right, strike, expiry}` and normalize to `instrumentType = "Option"` (IndexOption is a Phase-2 backfill, OQ-T). A `FUT` row or a symbol matching no expected form **safe-fails** (flagged, never mis-parsed as an option).
- **Date normalization (D11).** Parse each broker's date to canonical `YYYY-MM-DD`, with direction pinned **per broker** (Robinhood/Fidelity month-first; Zerodha ISO `order_execution_time`) — never guessed per value — and `YY`→20`YY`; a malformed date safe-fails.
- **Number/format cleanup + RFC-4180 (D12).** An RFC-4180 CSV parser handles quoted fields, embedded commas, and embedded newlines. On parsed values: Robinhood strips `$` and thousands commas and reads `(…)` as negative; Fidelity/Zerodha numbers are plain; the merger `S`-suffix quantity is stripped (meaning carried by `eventType`). **Footer/junk rows are skipped** by requiring a valid parsed date plus a recognized Action/Trans Code (rejects disclaimers, blank rows, the download-timestamp line).

> **Why centralize all this in one normalization step with a safe-fail rule?** Because the brokers disagree on nearly everything — column names, date order, number formatting, how options are encoded — and a single, mapper-driven step is the one place to reconcile them consistently. Preserving `rawAction` keeps the original for audit and Phase-2 re-labelling, and safe-failing an unparseable row (rather than guessing) means a bad row is visibly flagged instead of silently corrupting history or XIRR. _(Serves AP-33; see ADR-015, ADR-010, ADR-005.)_

---

## 11. Example Items (Sample Data)

**In plain terms:** Everything up to here described the _shapes_ of records and the rules they follow. This section makes them concrete: it shows real, filled-in sample records — written as the JSON items DynamoDB would actually store — for a small but realistic cast of users and brokers. The point is to let a reader _see_ the model working: how a single user's many different record types sit together in one folder, how dollars and rupees stay apart, how a journal entry carries copies of its tags, and how the known limitations actually look as data. A business reader can follow the story (two investors, three brokers, a handful of trades and notes); a developer can read the exact keys and attributes and check them against §7–§9.

**The shared rule on display in every example.** Every record a user owns is filed under that user's folder — its `PK` is `USER#<userId>` — so all of one person's data co-locates and stays private (ADR-002). Only the two _global_ record types break that pattern: the shared symbol-change list (`PK = GLOBAL#SYMBOLMAP`, §7.10) and the price cache (its own table, §9). Watch for that as the examples unfold: every `USER#u_alex` item below lives in the same partition and comes back together in one query; the global items sit deliberately outside it.

> **A note on the values.** Ids like `u_alex`, `t_meta01`, and the content hashes are obviously-fake but _internally consistent_ placeholders — the link items point at journal entries that exist, the scorecard counters match the evaluations shown, the symbol mapping's canonical ticker matches the trade that uses it, and the cashflow signs follow the §10.2 table. The aim is a single coherent worked scenario, not disconnected snippets. _(Illustrative only; not a prescribed id format — §1.6.)_

### 11.1 The Cast — Two Users, Three Brokers, Two Currencies

To exercise as much of the model as possible, the examples follow **two independent investors, plus a platform admin**:

- **`u_alex`** — a US investor. Holds a **Robinhood** account (USD) and a **Fidelity** account (USD). Phase 1 accepts a **single-account** Fidelity file, whose rows all belong to a single `acc_fid` (one account per broker, per D9/ADR-015); a multi-account Fidelity file is not supported in Phase 1 (§10.8), and multiple accounts within one broker is a Phase-2 extension. All USD.
- **`u_priya`** — an India investor. Holds a single **Zerodha** account (INR), with equity, an index option, and the multi-file Zerodha upload (§3). All INR.
- **`u_admin`** — a **platform admin** (`role = "admin"`). Owns no accounts, trades, or journals; exists only to illustrate the `admin` role and to be the actor who maintains the shared, admin-owned SymbolMapping (§11.11, ADR-012). Both investors carry `role = "user"`.

Together they cover all three brokers (§3), both currencies (§5.10, ADR-007), the two roles (`user`/`admin`, ADR-013), and — across the investors' trades — a broad span of the instrument types in `FEATURES.md` §4: stocks, an ETF, a fractional-share buy, a US option, a money-market fund, a mutual fund, an Indian equity, and an index option. Because each user's data is rooted at their own `USER#<userId>` partition, nothing of Alex's can ever surface in a query for Priya (or the admin), and vice versa (ADR-002).

### 11.2 User Profile Items

```json
{
  "PK": "USER#u_alex",
  "SK": "PROFILE",
  "entityType": "User",
  "userId": "u_alex",
  "email": "alex@example.com",
  "displayName": "Alex Carter",
  "role": "user",
  "createdAt": "2026-01-02T09:00:00Z",
  "settings": { "baseLocale": "en-US" }
}
```

```json
{
  "PK": "USER#u_priya",
  "SK": "PROFILE",
  "entityType": "User",
  "userId": "u_priya",
  "email": "priya@example.in",
  "displayName": "Priya Nair",
  "role": "user",
  "createdAt": "2026-01-05T04:30:00Z",
  "settings": { "baseLocale": "en-IN" }
}
```

The third profile is the **platform admin** — it owns no accounts, trades, or journals; it exists only to illustrate the `admin` role and to be the concrete actor behind the admin-owned SymbolMapping writes (§11.11, AP-27, ADR-012).

```json
{
  "PK": "USER#u_admin",
  "SK": "PROFILE",
  "entityType": "User",
  "userId": "u_admin",
  "email": "admin@beyondfolio.example",
  "displayName": "Platform Admin",
  "role": "admin",
  "createdAt": "2026-01-01T00:00:00Z",
  "settings": {}
}
```

### 11.3 BrokerAccount Items

Alex has one account per broker — a Robinhood account and a single Fidelity account (`acc_fid`) — per Phase-1 scope (D9/ADR-015); Phase 1 accepts a **single-account** Fidelity file (a multi-account file is not supported — §10.8), with multiple-accounts-per-broker deferred to Phase 2. Note every account is filed under its user (ADR-002) and stamps its own `currency` (ADR-007).

```json
{
  "PK": "USER#u_alex",
  "SK": "ACCOUNT#acc_rh",
  "entityType": "BrokerAccount",
  "accountId": "acc_rh",
  "broker": "Robinhood",
  "currency": "USD",
  "accountType": "Individual",
  "displayName": "Robinhood Individual",
  "createdAt": "2026-01-02T09:05:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "ACCOUNT#acc_fid",
  "entityType": "BrokerAccount",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "currency": "USD",
  "displayName": "Fidelity",
  "createdAt": "2026-01-03T14:00:00Z"
}
```

_(`accountType` is omitted here — in Phase 1 it is set only when the file states it, e.g. Zerodha `Individual`; a single Fidelity account leaves it unset per D9/ADR-015. Phase 1 accepts a **single-account** Fidelity export, so its rows all belong to this one `acc_fid`; a **multi-account (combined) Fidelity file is not supported in Phase 1** and hard-stops at detection (§10.8) — multiple accounts within one broker is a Phase-2 extension.)_

```json
{
  "PK": "USER#u_priya",
  "SK": "ACCOUNT#acc_zer",
  "entityType": "BrokerAccount",
  "accountId": "acc_zer",
  "broker": "Zerodha",
  "currency": "INR",
  "accountType": "Individual",
  "displayName": "Zerodha",
  "createdAt": "2026-01-05T04:35:00Z"
}
```

### 11.4 ImportedFile Items

Robinhood and Fidelity each provide a single **CSV** statement file (covering equity + options); Zerodha provides **two files** for one import — an equity trades file and an F&O trades file, each of which may be **CSV or XLSX** (§3). Each becomes its own `ImportedFile` keyed by its content fingerprint, so re-uploading any one of them is a safe no-op (§10.1, ADR-005). _(Zerodha's separate P&L/charges report is **not** ingested in Phase 1, so Zerodha fee cashflows are not captured — see §13; USD fees from Fidelity/Robinhood **are** captured.)_

```json
{
  "PK": "USER#u_alex",
  "SK": "FILE#sha256-rh-9f3c1a",
  "entityType": "ImportedFile",
  "contentHash": "sha256-rh-9f3c1a",
  "broker": "Robinhood",
  "fileName": "robinhood_activities.csv",
  "importedAt": "2026-04-01T18:20:00Z",
  "summary": { "tradesCreated": 3, "cashflowsCreated": 5 }
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "FILE#sha256-fid-22b7e0",
  "entityType": "ImportedFile",
  "contentHash": "sha256-fid-22b7e0",
  "broker": "Fidelity",
  "fileName": "fidelity_statement_mar2026.csv",
  "importedAt": "2026-04-01T18:25:00Z",
  "summary": { "tradesCreated": 3, "cashflowsCreated": 4 }
}
```

```json
{
  "PK": "USER#u_priya",
  "SK": "FILE#sha256-zer-eq-71a004",
  "entityType": "ImportedFile",
  "contentHash": "sha256-zer-eq-71a004",
  "broker": "Zerodha",
  "fileName": "zerodha_equity_tradebook.csv",
  "importedAt": "2026-04-02T05:10:00Z",
  "summary": { "tradesCreated": 1, "cashflowsCreated": 2 }
}
```

```json
{
  "PK": "USER#u_priya",
  "SK": "FILE#sha256-zer-fo-9c52d3",
  "entityType": "ImportedFile",
  "contentHash": "sha256-zer-fo-9c52d3",
  "broker": "Zerodha",
  "fileName": "zerodha_fo_tradebook.xlsx",
  "importedAt": "2026-04-02T05:11:00Z",
  "summary": { "tradesCreated": 1, "cashflowsCreated": 1 }
}
```

_(Phase 1 imports only the two Zerodha tradebook files — equity and F&O. Zerodha's separate P&L/charges report is not ingested, so there is no third `ImportedFile` for Priya and no Zerodha `FEE` cashflow — see §13.1.9.)_

### 11.5 Trade Items — Broad Instrument Coverage

These trades deliberately span the instrument types in `FEATURES.md` §4. Each is filed `TRADE#<date>#<tradeId>` so history returns in date order (ADR-009); each stamps its `accountId`, `broker`, and `currency` (denormalized from the account, §7.4) and its canonical `symbol` (resolved via ADR-010). Note the **META** trade: imported from a Fidelity file that still said **FB**, so `rawSymbol = "FB"` is preserved while `symbol = "META"` is the resolved canonical (this is the trade the §11.11 SymbolMapping resolves).

**Stock (Fidelity, USD) — with a resolved symbol (FB→META):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-10#t_meta01",
  "entityType": "Trade",
  "tradeId": "t_meta01",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "symbol": "META",
  "rawSymbol": "FB",
  "side": "BUY",
  "instrumentType": "Stock",
  "quantity": 10,
  "price": 480.0,
  "currency": "USD",
  "tradeDateTime": "2026-02-10T15:32:00Z"
}
```

**ETF (Robinhood, USD):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-12#t_voo01",
  "entityType": "Trade",
  "tradeId": "t_voo01",
  "accountId": "acc_rh",
  "broker": "Robinhood",
  "symbol": "VOO",
  "rawSymbol": "VOO",
  "side": "BUY",
  "instrumentType": "ETF",
  "quantity": 5,
  "price": 505.2,
  "currency": "USD",
  "tradeDateTime": "2026-02-12T16:00:00Z"
}
```

**Fractional share (Robinhood, USD) — `quantity` below 1 (§4):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-15#t_amzn01",
  "entityType": "Trade",
  "tradeId": "t_amzn01",
  "accountId": "acc_rh",
  "broker": "Robinhood",
  "symbol": "AMZN",
  "rawSymbol": "AMZN",
  "side": "BUY",
  "instrumentType": "Stock",
  "quantity": 0.25,
  "price": 178.4,
  "currency": "USD",
  "tradeDateTime": "2026-02-15T17:45:00Z"
}
```

**US Option — a call, with `optionDetails` (Robinhood, USD):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-18#t_aaplc01",
  "entityType": "Trade",
  "tradeId": "t_aaplc01",
  "accountId": "acc_rh",
  "broker": "Robinhood",
  "symbol": "AAPL",
  "rawSymbol": "AAPL",
  "side": "BUY",
  "instrumentType": "Option",
  "quantity": 1,
  "price": 3.5,
  "currency": "USD",
  "tradeDateTime": "2026-02-18T14:10:00Z",
  "optionDetails": {
    "right": "CALL",
    "strike": 200.0,
    "expiry": "2026-03-20",
    "contractMultiplier": 100
  }
}
```

**Mutual / Money Market fund (Fidelity, USD):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-20#t_spaxx01",
  "entityType": "Trade",
  "tradeId": "t_spaxx01",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "symbol": "SPAXX",
  "rawSymbol": "SPAXX",
  "side": "BUY",
  "instrumentType": "MutualFund",
  "quantity": 1000,
  "price": 1.0,
  "currency": "USD",
  "tradeDateTime": "2026-02-20T13:00:00Z"
}
```

**Mutual fund allocation (Fidelity, USD):**

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-28#t_fxaix01",
  "entityType": "Trade",
  "tradeId": "t_fxaix01",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "symbol": "FXAIX",
  "rawSymbol": "FXAIX",
  "side": "BUY",
  "instrumentType": "MutualFund",
  "quantity": 12.5,
  "price": 195.3,
  "currency": "USD",
  "tradeDateTime": "2026-02-28T21:00:00Z"
}
```

**Indian equity (Zerodha, INR):**

```json
{
  "PK": "USER#u_priya",
  "SK": "TRADE#2026-03-03#t_infy01",
  "entityType": "Trade",
  "tradeId": "t_infy01",
  "accountId": "acc_zer",
  "broker": "Zerodha",
  "symbol": "INFY",
  "rawSymbol": "INFY",
  "side": "BUY",
  "instrumentType": "Stock",
  "quantity": 50,
  "price": 1550.0,
  "currency": "INR",
  "tradeDateTime": "2026-03-03T05:20:00Z"
}
```

**Index Option — NIFTY, with `optionDetails` (Zerodha, INR):**

```json
{
  "PK": "USER#u_priya",
  "SK": "TRADE#2026-03-05#t_nifty01",
  "entityType": "Trade",
  "tradeId": "t_nifty01",
  "accountId": "acc_zer",
  "broker": "Zerodha",
  "symbol": "NIFTY",
  "rawSymbol": "NIFTY26MAR22000CE",
  "side": "BUY",
  "instrumentType": "IndexOption",
  "quantity": 50,
  "price": 120.0,
  "currency": "INR",
  "tradeDateTime": "2026-03-05T06:15:00Z",
  "optionDetails": {
    "right": "CALL",
    "strike": 22000,
    "expiry": "2026-03-26",
    "underlying": "NIFTY",
    "lotSize": 50
  }
}
```

### 11.6 Cashflow Items — Every Type, Both Currencies, the §10.2 Signs

These show a representative span of the 10 `cashflowType` values (D4) across both currencies, with `amount` signs exactly per the §10.2 table (investor's perspective: money _into_ investing is negative; money _back to the user_ is positive). They are filed `CASHFLOW#<currency>#<date>#<id>` so each currency's timeline reads in order from one query (AP-13, ADR-007/009). The BUY/SELL cash legs carry `relatedTradeId` linking back to their Trade (ADR-011).

**DEPOSIT (USD) — negative (cash put into the portfolio):**

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-02-01#cf_dep01",
  "entityType": "Cashflow",
  "cashflowId": "cf_dep01",
  "cashflowType": "DEPOSIT",
  "amount": -20000.0,
  "currency": "USD",
  "accountId": "acc_rh",
  "cashflowDate": "2026-02-01"
}
```

**BUY cash leg (USD) — negative, linked to the META trade:**

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-02-10#cf_meta01",
  "entityType": "Cashflow",
  "cashflowId": "cf_meta01",
  "cashflowType": "BUY",
  "amount": -4800.0,
  "currency": "USD",
  "accountId": "acc_fid",
  "cashflowDate": "2026-02-10",
  "relatedTradeId": "t_meta01",
  "symbol": "META"
}
```

**DIVIDEND (USD) — positive (cash received from a holding):**

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-03-15#cf_div01",
  "entityType": "Cashflow",
  "cashflowId": "cf_div01",
  "cashflowType": "DIVIDEND",
  "amount": 32.5,
  "currency": "USD",
  "accountId": "acc_fid",
  "cashflowDate": "2026-03-15",
  "symbol": "META"
}
```

**FEE (USD) — negative (charge paid out):**

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-03-15#cf_fee01",
  "entityType": "Cashflow",
  "cashflowId": "cf_fee01",
  "cashflowType": "FEE",
  "amount": -0.05,
  "currency": "USD",
  "accountId": "acc_rh",
  "cashflowDate": "2026-03-15"
}
```

**SELL cash leg (USD) — positive, linked to a partial sell of the VOO position:**

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-03-20#cf_voo_sell01",
  "entityType": "Cashflow",
  "cashflowId": "cf_voo_sell01",
  "cashflowType": "SELL",
  "amount": 1030.0,
  "currency": "USD",
  "accountId": "acc_rh",
  "cashflowDate": "2026-03-20",
  "relatedTradeId": "t_voo_sell01",
  "symbol": "VOO"
}
```

**WITHDRAWAL (INR) — positive (cash taken back out), on Priya's INR timeline:**

```json
{
  "PK": "USER#u_priya",
  "SK": "CASHFLOW#INR#2026-03-25#cf_wd01",
  "entityType": "Cashflow",
  "cashflowId": "cf_wd01",
  "cashflowType": "WITHDRAWAL",
  "amount": 15000.0,
  "currency": "INR",
  "accountId": "acc_zer",
  "cashflowDate": "2026-03-25"
}
```

**BUY cash leg (INR) — negative, linked to the INFY trade:**

```json
{
  "PK": "USER#u_priya",
  "SK": "CASHFLOW#INR#2026-03-03#cf_infy01",
  "entityType": "Cashflow",
  "cashflowId": "cf_infy01",
  "cashflowType": "BUY",
  "amount": -77500.0,
  "currency": "INR",
  "accountId": "acc_zer",
  "cashflowDate": "2026-03-03",
  "relatedTradeId": "t_infy01",
  "symbol": "INFY"
}
```

> **Note — no Zerodha `FEE` cashflow in Phase 1.** Unlike the USD side (Fidelity/Robinhood fees _are_ imported, e.g. `cf_fee01` above), Zerodha's charges live only in a separate P&L/charges report that Phase 1 does not ingest, and the equity/F&O tradebooks carry no per-trade charges. So Priya's INR timeline has **no `FEE` items**, and her INR XIRR is computed without fees (shown with a notice). Capturing Zerodha charges is a Phase-2 item — see §13.1.9.

### 11.7 JournalEntry Items

`FEATURES.md` §5.5 calls out two structural cases, both shown here on Alex's META trade: a trade can have **multiple journal entries** (here two — one citing "Money Control", one citing a friend), and a single entry can carry **multiple tags** (the first entry carries both "Money Control" and "swing trade"). Each entry is nested under its trade (`SK begins_with TRADE#t_meta01#JOURNAL#`, ADR-004) and carries denormalized `tagNames`, `symbol`, and `currency` so displaying it is one read (ADR-004). The first entry has been **evaluated a WIN**; the second a **LOSS**.

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#t_meta01#JOURNAL#je_meta_a",
  "entityType": "JournalEntry",
  "entryId": "je_meta_a",
  "tradeId": "t_meta01",
  "note": "Money Control flagged strong ad-revenue guidance; entering as a swing trade.",
  "prediction": "BULLISH",
  "tagNames": ["Money Control", "swing trade"],
  "symbol": "META",
  "currency": "USD",
  "evaluation": "WIN",
  "evaluatedAt": "2026-03-18T15:00:00Z",
  "evaluationPrice": 512.4,
  "createdAt": "2026-02-10T16:00:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#t_meta01#JOURNAL#je_meta_b",
  "entityType": "JournalEntry",
  "entryId": "je_meta_b",
  "tradeId": "t_meta01",
  "note": "A friend thought it would pull back after the run-up.",
  "prediction": "BEARISH",
  "tagNames": ["earnings play"],
  "symbol": "META",
  "currency": "USD",
  "evaluation": "LOSS",
  "evaluatedAt": "2026-03-18T15:00:00Z",
  "evaluationPrice": 512.4,
  "createdAt": "2026-02-11T10:00:00Z"
}
```

### 11.8 Tag Items

Three tags, each keyed by name so creating the same tag twice is idempotent (ADR-005). All filed under Alex.

```json
{
  "PK": "USER#u_alex",
  "SK": "TAG#Money Control",
  "entityType": "Tag",
  "tagName": "Money Control",
  "createdAt": "2026-02-10T16:00:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "TAG#swing trade",
  "entityType": "Tag",
  "tagName": "swing trade",
  "createdAt": "2026-02-10T16:00:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "TAG#earnings play",
  "entityType": "Tag",
  "tagName": "earnings play",
  "createdAt": "2026-02-11T10:00:00Z"
}
```

### 11.9 JournalEntry↔Tag Link Items

One link per (tag, entry) pairing (§7.8). Entry `je_meta_a` carries two tags, so it produces two links; `je_meta_b` carries one. Each link also carries its `GSI2PK`/`GSI2SK` so "all entries for this tag" is one index query (AP-21, §8.2). Note `GSI2PK` keeps `userId` inside it, so the tag view stays per-user (ADR-002).

```json
{
  "PK": "USER#u_alex",
  "SK": "JTAG#Money Control#je_meta_a",
  "entityType": "JournalTagLink",
  "tagName": "Money Control",
  "entryId": "je_meta_a",
  "tradeId": "t_meta01",
  "GSI2PK": "USER#u_alex#TAG#Money Control",
  "GSI2SK": "JOURNAL#je_meta_a"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "JTAG#swing trade#je_meta_a",
  "entityType": "JournalTagLink",
  "tagName": "swing trade",
  "entryId": "je_meta_a",
  "tradeId": "t_meta01",
  "GSI2PK": "USER#u_alex#TAG#swing trade",
  "GSI2SK": "JOURNAL#je_meta_a"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "JTAG#earnings play#je_meta_b",
  "entityType": "JournalTagLink",
  "tagName": "earnings play",
  "entryId": "je_meta_b",
  "tradeId": "t_meta01",
  "GSI2PK": "USER#u_alex#TAG#earnings play",
  "GSI2SK": "JOURNAL#je_meta_b"
}
```

### 11.10 TagScorecard Items

The counters match the evaluations in §11.7. The WIN on `je_meta_a` credited a win to both of its tags ("Money Control" and "swing trade"); the LOSS on `je_meta_b` credited a loss to "earnings play" (ADR-006, atomic `ADD`).

```json
{
  "PK": "USER#u_alex",
  "SK": "TAGSCORE#Money Control",
  "entityType": "TagScorecard",
  "tagName": "Money Control",
  "wins": 1,
  "losses": 0,
  "breakeven": 0,
  "updatedAt": "2026-03-18T15:00:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "TAGSCORE#swing trade",
  "entityType": "TagScorecard",
  "tagName": "swing trade",
  "wins": 1,
  "losses": 0,
  "breakeven": 0,
  "updatedAt": "2026-03-18T15:00:00Z"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "TAGSCORE#earnings play",
  "entityType": "TagScorecard",
  "tagName": "earnings play",
  "wins": 0,
  "losses": 1,
  "breakeven": 0,
  "updatedAt": "2026-03-18T15:00:00Z"
}
```

### 11.11 SymbolMapping (Global / Admin-Owned)

The one record type **not** filed under a user (`PK = GLOBAL#SYMBOLMAP`, ADR-012). This is the mapping that resolved Alex's Fidelity **FB** to canonical **META** at import (§11.5), so his history groups under the current ticker while the trade still preserves `rawSymbol = "FB"`.

```json
{
  "PK": "GLOBAL#SYMBOLMAP",
  "SK": "SYMBOL#Fidelity#FB",
  "entityType": "SymbolMapping",
  "broker": "Fidelity",
  "rawSymbol": "FB",
  "canonicalSymbol": "META",
  "effectiveDate": "2022-06-09",
  "source": "auto",
  "updatedAt": "2026-02-10T15:32:05Z"
}
```

### 11.12 PriceCache (Auxiliary Table)

These live in the **separate** price-cache table (§9), not the main table — they are global and ephemeral. `expiresAt` is **epoch seconds** (the TTL format). The META and INFY entries are fresh; the third (`PRICE#AAPL#USD`) is deliberately **already past its `expiresAt`** to set up the §11.14 expired-as-missing demonstration. (`1772000000` ≈ 2026-02-25; `2000000000` ≈ 2033, comfortably in the future.)

```json
{
  "PK": "PRICE#META#USD",
  "entityType": "PriceCache",
  "canonicalSymbol": "META",
  "price": 512.4,
  "currency": "USD",
  "asOf": "2026-03-18T14:59:30Z",
  "expiresAt": 2000000000
}
```

```json
{
  "PK": "PRICE#INFY#INR",
  "entityType": "PriceCache",
  "canonicalSymbol": "INFY",
  "price": 1588.75,
  "currency": "INR",
  "asOf": "2026-03-25T05:00:00Z",
  "expiresAt": 2000000000
}
```

```json
{
  "PK": "PRICE#AAPL#USD",
  "entityType": "PriceCache",
  "canonicalSymbol": "AAPL",
  "price": 198.1,
  "currency": "USD",
  "asOf": "2026-02-25T16:00:00Z",
  "expiresAt": 1772000000
}
```

### 11.13 Partition View — One User's Items, Co-located

The real point of single-table design is visible when you list one user's partition in `SK` order: many different record types, all under `USER#u_alex`, retrievable together. Below is that partition (abbreviated), showing item-type overloading (§6.3) and how a single `PK = USER#u_alex` query can sweep the whole folder, with `SK` prefixes selecting just the slice a feature needs.

| `PK`          | `SK`                                    | `entityType`   |
| ------------- | --------------------------------------- | -------------- |
| `USER#u_alex` | `ACCOUNT#acc_fid`                       | BrokerAccount   |
| `USER#u_alex` | `ACCOUNT#acc_rh`                        | BrokerAccount   |
| `USER#u_alex` | `CASHFLOW#USD#2026-02-01#cf_dep01`      | Cashflow       |
| `USER#u_alex` | `CASHFLOW#USD#2026-02-10#cf_meta01`     | Cashflow       |
| `USER#u_alex` | `CASHFLOW#USD#2026-03-15#cf_div01`      | Cashflow       |
| `USER#u_alex` | `CASHFLOW#USD#2026-03-15#cf_fee01`      | Cashflow       |
| `USER#u_alex` | `CASHFLOW#USD#2026-03-20#cf_voo_sell01` | Cashflow       |
| `USER#u_alex` | `FILE#sha256-fid-22b7e0`                | ImportedFile   |
| `USER#u_alex` | `FILE#sha256-rh-9f3c1a`                 | ImportedFile   |
| `USER#u_alex` | `JTAG#Money Control#je_meta_a`          | JournalTagLink |
| `USER#u_alex` | `JTAG#earnings play#je_meta_b`          | JournalTagLink |
| `USER#u_alex` | `JTAG#swing trade#je_meta_a`            | JournalTagLink |
| `USER#u_alex` | `PROFILE`                               | User           |
| `USER#u_alex` | `TAG#Money Control`                     | Tag            |
| `USER#u_alex` | `TAG#earnings play`                     | Tag            |
| `USER#u_alex` | `TAG#swing trade`                       | Tag            |
| `USER#u_alex` | `TAGSCORE#Money Control`                | TagScorecard   |
| `USER#u_alex` | `TAGSCORE#earnings play`                | TagScorecard   |
| `USER#u_alex` | `TAGSCORE#swing trade`                  | TagScorecard   |
| `USER#u_alex` | `TRADE#2026-02-10#t_meta01`             | Trade          |
| `USER#u_alex` | `TRADE#2026-02-12#t_voo01`              | Trade          |
| `USER#u_alex` | `TRADE#2026-02-15#t_amzn01`             | Trade          |
| `USER#u_alex` | `TRADE#2026-02-18#t_aaplc01`            | Trade          |
| `USER#u_alex` | `TRADE#2026-02-20#t_spaxx01`            | Trade          |
| `USER#u_alex` | `TRADE#2026-02-28#t_fxaix01`            | Trade          |
| `USER#u_alex` | `TRADE#t_meta01#JOURNAL#je_meta_a`      | JournalEntry   |
| `USER#u_alex` | `TRADE#t_meta01#JOURNAL#je_meta_b`      | JournalEntry   |

Priya's partition (`USER#u_priya`) is entirely separate — a query for Alex can never reach it (ADR-002):

| `PK`           | `SK`                                | `entityType` |
| -------------- | ----------------------------------- | ------------ |
| `USER#u_priya` | `ACCOUNT#acc_zer`                   | BrokerAccount |
| `USER#u_priya` | `CASHFLOW#INR#2026-03-03#cf_infy01` | Cashflow     |
| `USER#u_priya` | `CASHFLOW#INR#2026-03-25#cf_wd01`   | Cashflow     |
| `USER#u_priya` | `FILE#sha256-zer-eq-71a004`         | ImportedFile |
| `USER#u_priya` | `FILE#sha256-zer-fo-9c52d3`         | ImportedFile |
| `USER#u_priya` | `PROFILE`                           | User         |
| `USER#u_priya` | `TRADE#2026-03-03#t_infy01`         | Trade        |
| `USER#u_priya` | `TRADE#2026-03-05#t_nifty01`        | Trade        |

> **Why is this partition view worth showing?** It makes the abstract idea of §6.3 tangible: a dozen different record types live side by side in one folder, and a single `PK = USER#u_alex` query — narrowed by an `SK` prefix like `TRADE#` or `CASHFLOW#USD#` — pulls back exactly the slice a feature needs, in order, with no joins and no cross-user reach. _(See ADR-002, ADR-003, ADR-009.)_

### 11.14 Limitation Examples — Shown as Records

The three known soft spots from §10.6 are easiest to understand as _data_. Each is shown below with the sample records that trigger it, followed by a plain-English explanation. All three are carried to §13.

#### 11.14.1 Identical Same-Day Robinhood Transfers (collapse to one record)

Suppose Alex makes **two genuinely separate** Robinhood deposits of the exact same amount on the same day. Because each Cashflow's `cashflowId` is a deterministic fingerprint of its natural identity — account + type + currency + date + amount (§10.1, ADR-005) — both intended deposits compute the **same** `cashflowId`, and therefore the **same** `SK`:

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-04-05#cf_8f2a1b",
  "entityType": "Cashflow",
  "cashflowId": "cf_8f2a1b",
  "cashflowType": "DEPOSIT",
  "amount": -500.0,
  "currency": "USD",
  "accountId": "acc_rh",
  "cashflowDate": "2026-04-05"
}
```

The first deposit writes this item successfully. The second deposit — same account, same type, same amount, same day — derives the **identical** key `CASHFLOW#USD#2026-04-05#cf_8f2a1b`, so its conditional write (`attribute_not_exists`) fails and it is silently treated as a duplicate. **Result:** only one $500 deposit is recorded where the user actually made two. This is the accepted Phase 1 limitation from `FEATURES.md` §7 — a rare case, and the price of identity-by-natural-key (the same mechanism that makes safe re-uploads possible). _(Carried to §13.)_

#### 11.14.2 Zerodha F&O — Open vs. Close Ambiguity

Priya's NIFTY index-option trade (§11.5) arrives in the Zerodha F&O file with **no flag** saying whether it _opens_ a new position or _closes_ an existing one — the file simply records a buy/sell. The Trade record is faithful to what the file said, but it cannot record an intent the file never carried:

```json
{
  "PK": "USER#u_priya",
  "SK": "TRADE#2026-03-26#t_nifty_close01",
  "entityType": "Trade",
  "tradeId": "t_nifty_close01",
  "accountId": "acc_zer",
  "broker": "Zerodha",
  "symbol": "NIFTY",
  "rawSymbol": "NIFTY26MAR22000CE",
  "side": "SELL",
  "instrumentType": "IndexOption",
  "quantity": 50,
  "price": 210.0,
  "currency": "INR",
  "tradeDateTime": "2026-03-26T09:45:00Z",
  "optionDetails": {
    "right": "CALL",
    "strike": 22000,
    "expiry": "2026-03-26",
    "underlying": "NIFTY",
    "lotSize": 50
  }
}
```

Is this SELL _closing_ the earlier BUY of the same contract (§11.5), or _opening_ a new short position? The record itself can't say — both look identical in the file. This matters when deriving holdings for XIRR (§10.2): whether the NIFTY position nets to zero (closed) or to a short (still open) changes the terminal valuation. **Disposition:** open question — a likely resolution is an execution-time-ordered position tracker that infers open/close from sequence, but it isn't decided yet. _(Carried to §13.)_

#### 11.14.3 Dividend Reinvestment (DRIP)

When a dividend is automatically reinvested, it's not yet confirmed how each broker's file reports it — and therefore which records it should produce. Consider a reinvested META dividend. It clearly produces a `DIVIDEND` cashflow (cash received):

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-04-10#cf_div_drip01",
  "entityType": "Cashflow",
  "cashflowId": "cf_div_drip01",
  "cashflowType": "DIVIDEND",
  "amount": 32.5,
  "currency": "USD",
  "accountId": "acc_fid",
  "cashflowDate": "2026-04-10",
  "symbol": "META"
}
```

But does it _also_ produce a companion fractional **BUY** Trade (and its negative cash leg) for the reinvested shares — and does the broker file even report that buy?

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-04-10#t_meta_drip01",
  "entityType": "Trade",
  "tradeId": "t_meta_drip01",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "symbol": "META",
  "rawSymbol": "META",
  "side": "BUY",
  "instrumentType": "Stock",
  "quantity": 0.063,
  "price": 512.4,
  "currency": "USD",
  "tradeDateTime": "2026-04-10T13:00:00Z"
}
```

If both records are created, the dividend (+32.50) and the reinvestment buy (−32.50) roughly offset in the XIRR series while the holding grows — the economically correct picture. If only the dividend is recorded, XIRR sees cash that never actually left, and the derived holdings miss the reinvested shares. Which records to create depends on what the broker file actually says, which `FEATURES.md` §7 flags as unverified. **Disposition:** open question — needs checking against real broker files before the DRIP record pattern is finalized. _(Carried to §13.)_

> **Why show limitations as actual records?** Because a limitation stated abstractly is easy to wave away; shown as the exact items that would (or wouldn't) be written, it becomes precise — a reviewer can see _which_ `SK` collides, _which_ intent is missing, _which_ record pair is in doubt — and §13 can track each one concretely. _(See ADR-005; §10.6; §13.)_

### 11.15 Worked Example — One Raw Row Through the Pipeline

To make the import pipeline (§10.8) and normalization (§10.9) concrete, here is a **single Fidelity option-sale row** traveling all the way from raw file bytes to the two normalized items it produces. It exercises, in one row, the free-text `classify` step, the option-symbol `extract` parser (D10), date normalization (D11), the net-`Amount` fee handling (L7), and the buy/sell → **both a Trade and a Cashflow** rule (ADR-011). It uses the existing cast — Alex's single Fidelity `BrokerAccount` (`acc_fid`, §11.3).

**1. The raw CSV row (as delivered by Fidelity).** A closing sale of one AMZN call contract:

```
Run Date,Action,Symbol,Quantity,Price,Commission,Fees,Amount,Cash Balance
02/18/2026,"YOU SOLD CLOSING TRANSACTION",-AMZN260320C230,-1,6.30,0.65,0.04,629.31,12345.67
```

**2. Detection + account resolution (§10.8).** The header fingerprint matches the `FIDELITY_SINGLE_ACC_ACTIVITY` BrokerMapper (§7.13); the row resolves to Alex's `acc_fid` (found-or-create by `(userId, Fidelity)`).

**3. Mapping the columns, by the four `columnMapping` kinds (§10.9, ADR-015):**

| Raw field | Kind | Normalized result |
| --- | --- | --- |
| `Action = "YOU SOLD CLOSING TRANSACTION"` | **`classify`** (word-set) | `side = "SELL"`; raw text kept in `rawAction` |
| `Symbol = -AMZN260320C230` | **`extract`** (option parser, D10) | `instrumentType = "Option"`; `optionDetails = {underlying: "AMZN", right: "CALL", strike: 230, expiry: "2026-03-20"}` |
| `Run Date = 02/18/2026` | **`direct`** + date-normalize (D11) | `tradeDateTime`/`cashflowDate` → `2026-02-18` (month-first) |
| `Quantity = -1` | **`direct`** | `quantity = 1`, side already SELL |
| `Price = 6.30` | **`direct`** | `price = 6.30` |
| `Amount = 629.31` | **`direct`** (net, L7) | Cashflow `amount = +629.31` (already net of commission+fees) |
| `Commission = 0.65`, `Fees = 0.04` | display metadata (L7) | kept for display; **not** a separate FEE cashflow — already netted into `Amount` |
| `Cash Balance = 12345.67` | dedup distinguisher (D2) | folded into the `cashflowId`/`tradeId` fingerprint (Fidelity) |

_Fee check (L7): `6.30 × 100 − 0.65 − 0.04 = 629.31` — the file's `Amount` is already net of commission and fees, so recording it as the cash leg neither drops nor double-counts the charges._

**4. The two normalized items written (ADR-011).** The sale is both a Trade (for history) and a Cashflow (for XIRR):

```json
{
  "PK": "USER#u_alex",
  "SK": "TRADE#2026-02-18#t_amznopt01",
  "entityType": "Trade",
  "tradeId": "t_amznopt01",
  "accountId": "acc_fid",
  "broker": "Fidelity",
  "symbol": "AMZN",
  "rawSymbol": "-AMZN260320C230",
  "rawAction": "YOU SOLD CLOSING TRANSACTION",
  "side": "SELL",
  "instrumentType": "Option",
  "quantity": 1,
  "price": 6.30,
  "currency": "USD",
  "tradeDateTime": "2026-02-18T00:00:00Z",
  "optionDetails": { "underlying": "AMZN", "right": "CALL", "strike": 230, "expiry": "2026-03-20", "contractMultiplier": 100 },
  "GSI1PK": "USER#u_alex#BROKER#Fidelity",
  "GSI1SK": "TRADE#2026-02-18#t_amznopt01",
  "GSI3PK": "USER#u_alex#SYM#AMZN",
  "GSI3SK": "TRADE#2026-02-18#t_amznopt01"
}
```

```json
{
  "PK": "USER#u_alex",
  "SK": "CASHFLOW#USD#2026-02-18#cf_amznopt01",
  "entityType": "Cashflow",
  "cashflowId": "cf_amznopt01",
  "cashflowType": "SELL",
  "amount": 629.31,
  "currency": "USD",
  "accountId": "acc_fid",
  "cashflowDate": "2026-02-18",
  "cashBalance": 12345.67,
  "includeInXIRR": true,
  "rawAction": "YOU SOLD CLOSING TRANSACTION",
  "relatedTradeId": "t_amznopt01",
  "symbol": "AMZN"
}
```

**5. Dedup fingerprint (D2, §10.1).** The Fidelity Layer-2 identity for this row is `account | symbol | date | side | qty | price | cashBalance` = `acc_fid|AMZN|2026-02-18|SELL|1|6.30|12345.67`, hashed into `cashflowId`/`tradeId`. A re-upload of the same file recomputes the identical fingerprint and the `attribute_not_exists` write no-ops; the running `cashBalance` keeps two genuinely-distinct same-day identical sales apart.

> **Why walk through a single row end-to-end?** The per-decision rules in §10.9 are easier to trust when you can see them all fire on one real row — free-text classification, option parsing, date and fee handling, the two-item write, and the dedup key — producing exactly the item shapes §7.4/§7.5 define. _(See §10.8, §10.9, §7.4, §7.5; ADR-011, ADR-015, D10/L7/D2.)_

---

## 12. Access Pattern → Implementation Mapping

**In plain terms:** This is the proof that the design actually delivers. Section §4 listed every question the app asks of its data (AP-1 … AP-34); §7–§9 defined the records and indexes. This table joins the two ends together: for _each_ access pattern it states the exact DynamoDB operation, which table or index serves it, the precise key condition (or `begins_with` prefix), and the ADR(s) behind it. If every AP has a clean row here and every index defined in §8 is used by some row, the loop promised in §4.9 and §8.3 is closed — nothing required is missing and nothing in the model is unused.

A quick gloss on the operations named below: **`GetItem`** fetches one item by its exact key; **`Query`** reads a range of items sharing a partition key (optionally narrowed by a sort-key prefix or range — `begins_with` matches a prefix); **`PutItem`** writes a whole item (with `attribute_not_exists(...)` it only writes if the item is new — the idempotent/dedup guard of ADR-005); **`UpdateItem`** changes specific attributes of one item (with `ADD` it bumps a counter atomically — ADR-006). "Base" means the main `BeyondFolio` table's primary key; "GSI1/GSI2/GSI3" are the indexes from §8; "price-cache" is the auxiliary table from §9.

### 12.1 The Full Mapping (AP-1 … AP-34)

| AP                                                               | Operation                                                             | Table / Index                               | Key condition / prefix                                                                                       | ADR(s)                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **AP-1** Get user profile                                        | `GetItem`                                                             | Base                                        | `PK = USER#<userId>`, `SK = PROFILE`                                                                         | ADR-002                   |
| **AP-2** Create/update user                                      | `PutItem` / `UpdateItem`                                              | Base                                        | `PK = USER#<userId>`, `SK = PROFILE`                                                                         | ADR-002                   |
| **AP-2a** Provision profile on first access (idempotent)         | `PutItem` w/ `attribute_not_exists(PK)`                               | Base                                        | `PK = USER#<userId>`, `SK = PROFILE`                                                                         | ADR-005, ADR-013          |
| **AP-2b** Resolve identity (verify **Google** OIDC id_token)     | _Upstream (Google JWKS verify)_ — no table op                         | — (external)                                | Verifies the provider's ID token against Google's public keys; reads the stable `sub`                        | ADR-013, ADR-002          |
| **AP-2c** Resolve `(provider, sub)` → internal `userId` at login | `GetItem`                                                             | Base                                        | `PK = AUTH#<provider>#<providerSub>`, `SK = AUTH` → read `userId`; on first login create User + AuthIdentity | ADR-013, ADR-005          |
| **AP-3** List a user's accounts                                  | `Query`                                                               | Base                                        | `PK = USER#<userId>`, `SK begins_with ACCOUNT#`                                                              | ADR-002, ADR-003          |
| **AP-4** Create/update an account                                | `PutItem` / `UpdateItem`                                              | Base                                        | `PK = USER#<userId>`, `SK = ACCOUNT#<accountId>`                                                             | ADR-002                   |
| **AP-5** Has this file been imported?                            | `GetItem`                                                             | Base                                        | `PK = USER#<userId>`, `SK = FILE#<contentHash>`                                                              | ADR-005                   |
| **AP-6** Record a file imported (idempotent)                     | `PutItem` w/ `attribute_not_exists(PK)`                               | Base                                        | `PK = USER#<userId>`, `SK = FILE#<contentHash>`                                                              | ADR-005                   |
| **AP-7** Does this trade already exist?                          | `GetItem` (or conditional put in AP-8)                                | Base                                        | `PK = USER#<userId>`, `SK = TRADE#<date>#<tradeId>`                                                          | ADR-005                   |
| **AP-8** Record a trade once (idempotent)                        | `PutItem` w/ `attribute_not_exists(PK)`                               | Base                                        | `PK = USER#<userId>`, `SK = TRADE#<date>#<tradeId>`                                                          | ADR-005, ADR-009, ADR-011 |
| **AP-9** Record a cashflow once (idempotent)                     | `PutItem` w/ `attribute_not_exists(PK)`                               | Base                                        | `PK = USER#<userId>`, `SK = CASHFLOW#<currency>#<date>#<cashflowId>`                                         | ADR-005, ADR-007, ADR-011 |
| **AP-10** Unified trade history, newest first                    | `Query` (ScanIndexForward=false)                                      | Base                                        | `PK = USER#<userId>`, `SK begins_with TRADE#`                                                                | ADR-003, ADR-009          |
| **AP-11** Trades filtered to one broker                         | `Query`                                                               | **GSI1**                                    | `GSI1PK = USER#<userId>#BROKER#<broker>`, `GSI1SK begins_with TRADE#`                                       | ADR-001, ADR-002, ADR-009 |
| **AP-12** Fetch a single trade                                   | `Query` / `GetItem`                                                   | Base                                        | `PK = USER#<userId>`, `SK begins_with TRADE#<date>#<tradeId>` (or exact `SK`)                                | ADR-009                   |
| **AP-13** Cashflows for a currency, date order                   | `Query`                                                               | Base                                        | `PK = USER#<userId>`, `SK begins_with CASHFLOW#<currency>#`                                                  | ADR-007, ADR-009          |
| **AP-14** Current holdings (symbols + quantities)                | **Derived** — `Query` trades, then net per symbol                     | Base (+ price-cache for valuation)          | `PK = USER#<userId>`, `SK begins_with TRADE#` → net buys/sells (§10.2); no Holdings item, no index           | ADR-001, ADR-010          |
| **AP-15** List journal entries for a trade                       | `Query`                                                               | Base                                        | `PK = USER#<userId>`, `SK begins_with TRADE#<tradeId>#JOURNAL#`                                              | ADR-004                   |
| **AP-16** Create a journal entry                                 | `PutItem`                                                             | Base                                        | `PK = USER#<userId>`, `SK = TRADE#<tradeId>#JOURNAL#<entryId>`                                               | ADR-004                   |
| **AP-17** Fetch an entry with its tags                           | `GetItem`                                                             | Base                                        | `PK = USER#<userId>`, `SK = TRADE#<tradeId>#JOURNAL#<entryId>` (`tagNames` denormalized on it)               | ADR-004                   |
| **AP-18** List a user's tags                                     | `Query`                                                               | Base                                        | `PK = USER#<userId>`, `SK begins_with TAG#`                                                                  | ADR-002                   |
| **AP-19** Create a tag (idempotent on name)                      | `PutItem` w/ `attribute_not_exists(PK)`                               | Base                                        | `PK = USER#<userId>`, `SK = TAG#<tagName>`                                                                   | ADR-005                   |
| **AP-20** Attach tag(s) to an entry                              | `PutItem` (one link per pairing) + `UpdateItem` on entry's `tagNames` | Base                                        | link `SK = JTAG#<tagName>#<entryId>` (sets `GSI2PK`/`GSI2SK`); entry `tagNames` updated                      | ADR-004                   |
| **AP-21** List entries for a tag                                 | `Query`                                                               | **GSI2**                                    | `GSI2PK = USER#<userId>#TAG#<tagName>` (`GSI2SK begins_with JOURNAL#`)                                       | ADR-004, ADR-002          |
| **AP-22** Evaluate an entry → Win/Loss/Breakeven                 | `UpdateItem` (sets `evaluation`, `evaluatedAt`, `evaluationPrice`)    | Base (+ price-cache read, + symbol resolve) | `PK = USER#<userId>`, `SK = TRADE#<tradeId>#JOURNAL#<entryId>`                                               | ADR-006, ADR-010          |
| **AP-23** Bump each tag's win/loss counters                      | `UpdateItem` w/ `ADD` (per tag on the entry)                          | Base                                        | `PK = USER#<userId>`, `SK = TAGSCORE#<tagName>`                                                              | ADR-006                   |
| **AP-24** Read a tag's scorecard                                 | `GetItem`                                                             | Base                                        | `PK = USER#<userId>`, `SK = TAGSCORE#<tagName>`                                                              | ADR-006                   |
| **AP-25** List tags ranked by track record                       | `Query` (then sort in app)                                            | Base                                        | `PK = USER#<userId>`, `SK begins_with TAGSCORE#`                                                             | ADR-006                   |
| **AP-26** Resolve (broker, raw symbol) → canonical               | `GetItem`                                                             | Base (global partition)                     | `PK = GLOBAL#SYMBOLMAP`, `SK = SYMBOL#<broker>#<rawSymbol>`                                                  | ADR-010, ADR-012          |
| **AP-27** Add/correct a symbol mapping (admin)                   | `PutItem` / `UpdateItem`                                              | Base (global partition)                     | `PK = GLOBAL#SYMBOLMAP`, `SK = SYMBOL#<broker>#<rawSymbol>`                                                  | ADR-010, ADR-012          |
| **AP-28** Get cached price (if fresh)                            | `GetItem` (+ §9.4 freshness check)                                    | **Price-cache**                             | `PK = PRICE#<canonicalSymbol>#<currency>`                                                                    | ADR-008, ADR-010          |
| **AP-29** Store a freshly fetched price (TTL)                    | `PutItem` (plain overwrite, `expiresAt = now + cacheWindow`)          | **Price-cache**                             | `PK = PRICE#<canonicalSymbol>#<currency>`                                                                    | ADR-008                   |
| **AP-30** Trades filtered to one ticker                          | `Query`                                                               | **GSI3**                                    | `GSI3PK = USER#<userId>#SYM#<canonicalSymbol>`, `GSI3SK begins_with TRADE#`                                  | ADR-001, ADR-010          |
| **AP-31** Get a ticker's historical price series (chart)         | `GetItem` (+ 1-day freshness check, §9.6)                             | **Price-cache**                             | `PK = PRICEHIST#<canonicalSymbol>#<currency>`                                                                | ADR-014, ADR-008          |
| **AP-32** Store a fetched historical series (dated)              | `PutItem` (plain overwrite, sets `fetchedDate = today`, `expiresAt`)  | **Price-cache**                             | `PK = PRICEHIST#<canonicalSymbol>#<currency>`                                                                | ADR-014, ADR-008          |
| **AP-33** Match a file to its BrokerMapper on upload             | `GetItem` (header-fingerprint match in app code)                     | Base (global partition)                     | `PK = GLOBAL#BROKERMAPPER`, `SK = MAPPER#<fileType>`                                                         | ADR-015, ADR-012          |
| **AP-34** Admin: create / update / delete a BrokerMapper         | `PutItem` / `UpdateItem` / `DeleteItem`                              | Base (global partition)                     | `PK = GLOBAL#BROKERMAPPER`, `SK = MAPPER#<fileType>`                                                         | ADR-015, ADR-012          |

_Trade-chart markers need no row of their own — they reuse **AP-30** (GSI3), filtered in the app to the opened trade's currency/market (equity only). See §10.7 and ADR-014._

### 12.2 Index Utilization — No Orphans

Reading the table by _table/index_ confirms the model is both complete and minimal:

- **Base table (primary key)** serves the large majority — AP-1…AP-10, AP-12…AP-20, AP-22…AP-27, and the BrokerMapper reads/writes AP-33/AP-34 (its own `GLOBAL#BROKERMAPPER` partition) — because the §7 key shapes were designed _for_ those questions (currency-first cashflow keys, trade-nested journal keys, tag-name keys, the global symbol partition). Auth provisioning (**AP-2a**) is a base-table conditional `PutItem` on the `PROFILE` item; token verification (**AP-2b**) uses **no table/index at all** — it is verified upstream against the provider's JWKS (Google) in our own OAuth flow (ADR-013). Identity resolution (**AP-2c**) is a base-table `GetItem` on the **AuthIdentity** item (`AUTH#<provider>#<sub>` → `userId`, §7.12) — a direct key read, **no new index needed**; together these produce the trusted internal `userId` every base-table key depends on.

- **GSI1** is used by exactly one pattern, **AP-11** (trades filtered to one broker) — the one read the base `TRADE#` ordering can't do efficiently.
- **GSI2** is used by exactly one pattern, **AP-21** (entries for a tag) — the many-to-many reverse lookup.
- **GSI3** is used by exactly one pattern, **AP-30** (trades filtered to one ticker) — the by-symbol read the base `TRADE#` ordering can't do without a full-partition filter.
- **Price-cache table** serves **AP-28/AP-29**.
- **AP-14** uses _no_ dedicated structure at all — it is derived from Trade records (§10.2), honoring the "no speculative entity" rule (ADR-001).

Both GSIs are therefore justified by a real query (neither is an orphan), and no access pattern is left unserved.

> **Why does this table close the loop?** Because it pairs each of the §4 access patterns with a concrete operation and key, and the §12.2 read-back shows every defined index is actually used. That is access-pattern-first proven end to end: every requirement in `FEATURES.md` traces to an access pattern (§4.9), every access pattern traces to an implementation here, and every index traces back to the access pattern that earns it (§8.3). Nothing required is missing; nothing modeled is unused. _(See ADR-001; §4.9; §8.3.)_

---

## 13. Open Questions & Assumptions

**In plain terms:** This is the honest fine print. Every model rests on a few things the source data can't fully settle and a few simplifying choices we made on purpose — and writing them down is what keeps the design trustworthy. This section gathers two kinds of "things to be aware of": **Open Questions** — genuine gaps where a broker's file doesn't tell us enough to be certain, which we've handled as best we can for Phase 1 and flagged for a proper Phase-2 answer; and **Assumptions** — the deliberate simplifications the model leans on, stated plainly so no one mistakes them for oversights. A business reader can read each item's first line and the disposition; a developer gets the exact place in the model where it bites and the proposed direction.

> **Note on decision tracking.** This section introduces **no new decision IDs.** The Architecture Decision Records in §5 (ADR-001 … ADR-016) together with this section are the single source of truth for the DynamoDB model's reasoning. (The relational-era open questions OQ-006 / OQ-007 recorded elsewhere in the project's notes describe the retired design and are reference-only — they are _not_ carried into this model.)

### 13.1 Open Questions

These gather every open question the import design surfaced. The first three (OQ-A/B/C) are the soft spots also shown as concrete records in §11.14; the rest (OQ-D…OQ-T) are verification items, deferred implementation choices, or Phase-2 flows raised while settling the import decisions (D1–D14). Each is an accepted Phase 1 position — the model still works; where a broker file is silent or ambiguous, or a choice is deliberately deferred, it is flagged here rather than hidden. Each entry states _what it is_, _where it bites in the model_, the _current Phase 1 disposition_, and a _proposed Phase-2 direction_. (Several are **resolved** or **largely resolved** and marked so.)

#### 13.1.1 OQ-A — Robinhood Identical Same-Day Rows Split Across Files (narrowed by D2)

- **What it is:** The per-broker Layer-2 distinguisher (D2, §10.1) already keeps identical-looking same-day rows apart **within one file** — Zerodha by `brokerTradeId`, Fidelity by `cashBalance`, Robinhood by a within-file `occurrence #N`. The **only residual** is **Robinhood-specific**: two genuinely-distinct rows with the exact same identity (same symbol/side/qty/price, or same transfer type+amount) on the same day that are **never present together in a single uploaded file** — e.g. split across separately-filtered exports. Because `#N` counts occurrences _within the current file_, each lone copy recomputes `#1`, so the second import collides with the stored `#1` and is skipped.
- **Where it bites:** The record write path (AP-8/AP-9) and the dedup mechanism (§10.1). It applies only to Robinhood (Fidelity's `cashBalance` and Zerodha's `trade_id` disambiguate even across files); **any single file that lists both copies captures both**. Missing a second copy slightly understates trades/cash for the derived holdings and XIRR series (§10.2).
- **Current disposition (Phase 1):** **Accepted limitation** (`FEATURES.md` §7), much narrower than before D2. It is the residual price of identity-by-natural-key — the mechanism that makes re-uploading safe (ADR-005) — for the one broker that gives neither a stable trade id nor a per-row running balance.
- **Proposed Phase-2 direction:** Extend the Robinhood key with a cross-file-stable disambiguator if a real export exposes one (e.g. an order/reference id), or reconcile across a user's overlapping Robinhood files by session. Needs validation against real Robinhood exports to confirm a stable disambiguator exists.

#### 13.1.2 OQ-B — Zerodha F&O: Open vs. Close Ambiguity

- **What it is:** Zerodha's futures-and-options (F&O) file records a buy or a sell of a contract but carries **no flag** for whether that trade _opens_ a new position or _closes_ an existing one. The Trade record is faithful to exactly what the file said, but it cannot store an intent the file never carried.
- **Where it bites:** Deriving current holdings (AP-14) and therefore the terminal valuation that the XIRR calculation needs (§10.2); shown as data in §11.14.2. Whether a later SELL of a contract _nets the position to zero_ (it was a close) or _opens a short_ (it was a new position) changes the derived holding — and there is no field that says which.
- **Current disposition (Phase 1):** **Accepted limitation** (`FEATURES.md` §7). Trades are stored faithfully; the open/close interpretation is simply not inferred in Phase 1, so F&O positions may be netted imperfectly for derived-holdings purposes.
- **Proposed Phase-2 direction:** An **execution-time-ordered position tracker** — process a contract's trades in chronological order and infer open/close from the running position (a buy when flat opens; a sell that returns the net to zero closes; and so on). This is logic layered over the existing faithful Trade records — it requires no schema change, only a derivation step — but it must be designed and validated before it can be relied on.

#### 13.1.3 OQ-C — Dividend Reinvestment (DRIP) Record Pattern

- **What it is:** When a dividend is automatically reinvested (a DRIP), it is not yet confirmed how each broker's file reports it — and therefore which records the model should produce. A DRIP clearly yields a `DIVIDEND` cashflow (cash received), but it is unclear whether the file _also_ reports a companion fractional **BUY** Trade (and its negative cash leg) for the reinvested shares.
- **Where it bites:** The import pipeline's choice of which records to emit, affecting both derived holdings (AP-14) and the XIRR series (§10.2); shown as data in §11.14.3. If both records are created, the dividend (+) and the reinvestment buy (−) roughly offset in the XIRR series while the holding grows — the economically correct picture. If only the dividend is recorded, XIRR sees cash that never actually left and the derived holdings miss the reinvested shares.
- **Not to be confused with the explicit `REINVESTMENT` row (settled).** When a Fidelity file carries its own `REINVESTMENT` line, §10.9 already normalizes it to a **BUY** (labelled "DRIP") — that handling is decided. OQ-C is the _separate_ question of whether a broker, on an **auto-reinvested dividend**, emits **only** a `DIVIDEND` row or **also** a companion fractional BUY row; where the file provides both explicit rows the pattern is already handled, and D9 observed exactly such same-day `DIVIDEND` + `REINVESTMENT` pairings in the dummy Fidelity file. What remains open is confirming, per broker, whether a companion buy is _always_ reported (so the pipeline neither invents nor drops the reinvestment leg).
- **Current disposition (Phase 1):** **Open / unverified** (`FEATURES.md` §7). The model _can_ represent either interpretation faithfully (DIVIDEND-only, or DIVIDEND + companion BUY + cash leg); what's undecided is which one matches each broker's actual file output when the reinvestment is automatic and not spelled out as its own row.
- **Proposed Phase-2 direction:** Verify against **real Fidelity / Robinhood DRIP statements** what records each broker emits, then fix the canonical record pattern (and the import-pipeline rule) accordingly. No schema change is anticipated — the existing Cashflow and Trade items already cover both shapes — only a confirmed parsing rule.

#### 13.1.4 OQ-D — User Profile Provisioning Mechanism — **RESOLVED**

- **What it was:** When and how the `User` profile item (§7.1) is created — a pre-provisioned step at signup vs. lazily on first request.
- **Resolution:** **Resolved — first-login provisioning.** Under self-managed OAuth (ADR-013) there is no separate signup step and no third-party trigger (e.g. a Cognito Post-Confirmation Lambda) to hang provisioning off. On a user's **first** successful sign-in, after the provider's token is verified, the backend mints an internal `userId` and writes both the `User` profile (§7.1) and the matching **AuthIdentity** item (§7.12) — each guarded by `attribute_not_exists` so a concurrent or repeated first login is a safe no-op (ADR-005). A returning user is resolved by the AuthIdentity lookup (AP-2c) and no provisioning occurs.
- **Where it lands in the model:** The provisioning write path (AP-2a) and the login lookup (AP-2b/AP-2c); the login flow is spelled out in §7.12. No other item or key is affected.
- **Anchored by:** ADR-013 (self-managed OAuth; first-login provisioning), ADR-005 (idempotent create-if-not-exists writes).

#### 13.1.5 OQ-F — Session / Token Strategy After Sign-In

- **What it is:** Once the provider's token is verified and the internal `userId` is resolved, Beyond Folio issues and manages **its own session** (ADR-013) — but the exact mechanism is not yet fixed. Options include an app-signed JWT (stateless, verified per request) vs. a server-side session record; plus the refresh, logout, and revocation behavior each implies.
- **Where it bites:** The auth layer _above_ the data model — how a request proves who it is before any DynamoDB access. It does **not** change any item shape or key; every access pattern still depends only on a trusted `userId` however the session is carried.
- **Current disposition (Phase 1):** **Open / deferred to the TRD.** The model is fully specified regardless: whatever the session mechanism, it yields the trusted `userId` that roots every key (ADR-002). If a server-side session store is chosen, whether it lives in DynamoDB (e.g. a `SESSION#<id>` item with TTL) or elsewhere is itself part of this open question.
- **Proposed direction:** Settle in the TRD alongside the OAuth flow implementation. Anchored by ADR-013 (we own the session) and ADR-002 (the resolved `userId` is what isolation depends on).

#### 13.1.6 OQ-G — Phase-2 Account Linking (Google ↔ Zerodha)

- **What it is:** In Phase 2, a user who signs in with **both** Google and Zerodha should resolve to the **same** Beyond Folio account rather than two separate ones (`FEATURES.md` §5.11; FR-A6). How the second provider identity gets linked to an existing `userId` — and how a linking conflict (the second identity already maps to a _different_ `userId`) is handled — is not yet decided.
- **Where it lands in the model:** The AuthIdentity item (§7.12) is already shaped for this: linking is simply writing a _second_ AuthIdentity item (`AUTH#zerodha#<sub>` → the _same_ `userId`). No schema change is anticipated — what's open is the linking _flow_ (initiated from a signed-in session?) and conflict resolution.
- **Current disposition (Phase 1):** **Deferred to Phase 2** (Zerodha login itself is Phase 2). Phase 1 has exactly one AuthIdentity per user (Google).
- **Proposed Phase-2 direction:** Add a "link another provider" flow from an authenticated session that verifies the new provider's token and writes the second AuthIdentity item pointing at the current `userId`, with a guard that rejects (or offers a merge for) an identity already bound to another account. Anchored by ADR-013 and ADR-005.

#### 13.1.7 OQ-E — Historical Price Series Sourcing (for the Trade Chart) — **RESOLVED (provider chosen)**

- **What it is:** The FR-H5 trade chart (§5.12, §9.6, ADR-014) draws a ticker's **historical price line** from an external market-data service. The _approach_ is settled — lazily fetch a `(canonicalSymbol, currency)` series on first view and reuse it for the day (1-day freshness) — and the **provider per market is now chosen**; the only remaining detail is the exact **time range and granularity** shown (e.g. ~1 year of daily closes vs a selectable range).
- **Where it lands in the model:** Only the ephemeral historical-series cache (§9.6, AP-31/AP-32) and the chart-render logic (§10.7). No durable item or key is affected — the `PRICEHIST#…` shape holds whatever series the chosen provider returns.
- **Current disposition (Phase 1):** **Resolved — providers selected.** The market-data provider is chosen **per currency** (the price-cache routing axis): **INR → Zerodha Kite API** (Kite serves both current and historical prices, and is already coming in Phase 2 as a login provider, so it is not a throwaway dependency — note its historical data requires a paid historical-data subscription and a user Kite session); **USD → Twelve Data** (chosen over AlphaVantage, whose free tier of ~25 requests/day would throttle the historical-series backfill even at Phase-1 scale). Both sit behind the single market-data interface (`getCurrentPrice` / `getDailySeries`), routed by currency. The range/granularity (default ~1 year of daily closes) is confirmed when the integration is built. A future provider change needs no schema change, only the fetch/parse step feeding §9.6.

#### 13.1.7a OQ-E2 — NSE vs BSE Collapse Under the Currency-Keyed Cache — **ACCEPTED LIMITATION**

- **What it is:** The price cache is keyed by `(canonicalSymbol, currency)` rather than by exchange (§9.2, A-7), because the broker statement files reliably carry the account currency but not the exchange (only Zerodha names it). A consequence: a ticker listed on **both NSE and BSE** — both quoted in INR — maps to a **single** cache entry (e.g. `PRICE#RELIANCE#INR`), so one price is served regardless of which Indian exchange the trade executed on.
- **Where it lands in the model:** Only the ephemeral price/history cache (§9, AP-28/29/31/32). No durable item is affected.
- **Current disposition (Phase 1):** **Accepted.** NSE and BSE quotes for the same stock track within a fraction of a percent, immaterial to a per-currency XIRR figure. Cross-country dual listings (a USD listing vs an INR listing) remain correctly separated because they differ in **currency**.
- **Proposed direction (if ever needed):** Zerodha's files do carry the exchange, so a future refinement could extend the INR key to `(canonicalSymbol, currency, exchange)` for Zerodha-sourced instruments only — no change to the USD path. Not planned for Phase 1.

#### 13.1.8 OQ-H — Admin User Management (Disable / Delete a User) — **ON HOLD**

- **What it is:** `PRD.md`/`FEATURES.md` describe the **admin** role as being able to "manage users," but the only admin capability actually modeled is maintaining the global symbol map (AP-26/AP-27, ADR-012). A concrete admin ability to **disable** (block a user's login while retaining their data) or **delete** (permanently remove a user and everything they own) is _stated_ but **not modeled** — there is no access pattern, item, or index for it.
- **Where it'd bite in the model:** It requires an admin to **enumerate/reach other users** — which the per-user isolation rule (ADR-002, `PK = USER#<userId>`) deliberately prevents. There is currently **no way to list all users** (no users-enumeration index or shared users partition), so the capability cannot be executed against the model as designed. Delete would also have to remove the user's non-user-rooted **AuthIdentity** item(s) (§7.12), not just the `USER#<userId>` partition.
- **Current disposition (Phase 1):** **On hold / out of Phase 1 scope.** The docs have been narrowed so the admin's Phase-1 role is only "correct corporate-action symbol mappings"; the disable/delete capability is explicitly deferred and not committed.
- **Proposed direction (if taken up):** Add admin access patterns (list users, disable/enable, delete) plus a **users-enumeration index** (e.g. a sparse GSI over the `PROFILE` items, `GSI_PK = "USER"`) and a **`status`** attribute on the `User` item that the login path checks; record it as a **new ADR** — a _second_ deliberate, admin-only exception to ADR-002 (the first being `GLOBAL#SYMBOLMAP`, ADR-012), with authorization gated on `role = "admin"`. Delete would be a hard delete of the whole user partition **plus** the associated AuthIdentity item(s). _(No structures added yet — deferred until the decision is made.)_

#### 13.1.9 OQ-I — Zerodha Fees/Charges Omitted from INR XIRR (Phase 1)

- **What it is:** Zerodha's charges (brokerage, STT, GST, stamp duty, exchange/SEBI fees, etc.) appear only in a **separate P&L/charges report**, which Phase 1 does **not** ingest; the equity/F&O tradebooks we import carry **no per-trade charge columns**. So no Zerodha `FEE` cashflow is written, and the **INR XIRR is computed without fees** (`FEATURES.md` §5.4, §7). _(USD fees — Fidelity commission/fees columns and the Robinhood Gold subscription — **are** imported, so USD XIRR includes fees.)_
- **Where it bites:** The INR cashflow series feeding XIRR (§10.2, AP-13) is missing fee outflows, so the INR return reads **slightly optimistic**. No item shape changes — there simply are no `FEE` items on the INR timeline (see the §11.6 note). The UI shows the INR figure with a **notice that it excludes fees/charges/commissions**.
- **Current disposition (Phase 1):** **Accepted limitation.** Zerodha charges are deliberately out of the Phase-1 import; the INR XIRR is honestly labelled fee-exclusive.
- **Proposed Phase-2 direction:** Ingest the Zerodha P&L/charges report as an optional fee-only source. Because it gives **period-aggregate** charges (not per-trade), the likely shape is **one (or a few) aggregate `FEE` Cashflow item(s)** dated at the report's period-end — which XIRR consumes fine (it only needs dated amounts). The upload/association mechanism and overlapping-period dedup are to be worked out in Phase 2. No change to existing item shapes anticipated — a `FEE` Cashflow already exists.

#### 13.1.10 OQ-J — Fidelity Fee Handling — **RESOLVED** (L7/D2)

- **What it was:** How to treat Fidelity's charge columns without double-counting them in XIRR.
- **Resolution:** **Resolved (L7).** The Fidelity trade `Amount` is **already net of commission + fees** — verified arithmetically against the dummy file (e.g. an option sale `6.30 × 100 − 0.65 − 0.04 = 629.31`; worked through in §11.15). So the net `Amount` is used directly as the cash leg, and the `Commission`/`Fees` columns are kept as **display metadata only**, **not** written as separate `FEE` cashflows — which is exactly what avoids double-counting (§10.9 fee handling). This corrects the earlier assumption that the two columns should each become a `FEE` cashflow.
- **Where it lands in the model:** §10.9 (fee handling) and the Cashflow write (§7.5, AP-9) feeding USD XIRR (§10.2). No schema change — `FEE` cashflows still exist for the broker rows that genuinely are standalone charges (e.g. Robinhood `GOLD`/`AFEE`/`DTAX`).
- **Residual (non-blocking):** the exact per-column split — what "commission" vs "fees" each itemize — is display detail worth a spot-check against a broader real Fidelity export; it does **not** affect the XIRR math, which relies only on the net `Amount`. _(Related: OQ-Q, real-file verification.)_

#### 13.1.11 OQ-K — Fidelity External Cashflows & SPAXX Sweeps — **LARGELY RESOLVED** (D5)

- **What it was:** Whether Fidelity files carry the external deposits/withdrawals XIRR needs, and how the SPAXX money-market sweeps should be treated.
- **Resolution:** **Largely resolved (D5).** A richer Fidelity export showed external cash movements **are** present as `Electronic Funds Transfer Received`/`Paid` rows → normalized to **DEPOSIT/WITHDRAWAL** (`includeInXIRR=true`). SPAXX `PURCHASE/REDEMPTION` sweeps are **internal** cash↔money-market moves → stored but hidden, `includeInXIRR=false` (§10.9); SPAXX **interest** (a `DIVIDEND RECEIVED SPAXX` row) is a real return and **is** counted.
- **Where it bites:** The USD cashflow series feeding XIRR (§10.2, AP-13).
- **Residual / Phase-2:** verify the transfer-row wording and coverage across more real exports (tracked with OQ-Q); a `Cash Balance` reconciliation is kept only as a Phase-2 fallback.

#### 13.1.12 OQ-L — Stock-vs-ETF Classification (for the Trade Chart) (D6)

- **What it is:** `instrumentType` must distinguish `Stock` from `ETF` (the chart, FR-H5, renders for both), but broker files don't always label which a ticker is.
- **Where it bites:** `instrumentType` on Trade (§7.4) and chart gating (§10.7).
- **Current disposition (Phase 1):** conservative heuristic — **default `Stock`, upgrade to `ETF` only on an unambiguous "ETF" marker**; never a wrong ETF. `FEATURES.md` §4 lists both as tracked types — they are tracked; ETF is best-effort-detected in Phase 1.
- **Proposed Phase-2 direction:** an authoritative symbol lookup (likely via the OQ-E market-data provider) backfills true Stock/ETF (and other) types.

#### 13.1.13 OQ-M — Mapper Correction → Retroactive Re-Import — **PARTIALLY RESOLVED** (D14)

- **What it is:** Phase-1 mapper corrections are **forward-only** (L9, §10.8); already-imported rows read through a since-corrected mapper are not reprocessed.
- **Partially resolved (D14/ADR-016):** the **prerequisite** — keeping the raw file — is now met in Phase 1: every confirmed import's original bytes are retained in S3 at `<userId>/<contentHash>`, referenced by `ImportedFile.s3Key`. What remains Phase-2 is the **engine**: a retroactive re-import that re-runs the corrected mapper over the stored file and replaces affected rows, plus the **undo-an-import** flow (PRD §6, O6) that must delete both the DB records and the S3 object.
- **Where it bites:** Import pipeline (§10.8) forward-only correction; no Phase-1 read path consumes the stored files.

#### 13.1.14 OQ-N — RSU Vesting Mechanics (D1/D4)

- **What it is:** How to treat Fidelity RSU rows: a `JOURNALED RSU <tax>` withholding line and a zero-cost `YOU BOUGHT RSU#### ` share-in.
- **Current disposition (Phase 1):** the RSU-tax row → **ADJUSTMENT**, `includeInXIRR=false` (users say the employer already withheld); the zero-cost share-in → **BUY @ price 0** (shares enter holdings, no cash effect).
- **Where it bites:** Cashflow `includeInXIRR` (§7.5) and derived holdings (§10.2). Caveat: a BUY@0 leaves a $0 cost basis, which would inflate any Phase-2 realized-P/L.
- **Proposed direction:** verify against a real vesting event; `includeInXIRR` is flippable per row with no re-modeling if the assumption proves wrong.

#### 13.1.15 OQ-O — Merger / Split Ratio Interpretation (D3)

- **What it is:** Corporate-action event rows (D3) don't fully give the ratio: a Robinhood `SPL` gives a top-up quantity (e.g. `0.4434`), not the split ratio; a `MRGS` gives in/out quantities (with an `S`-suffix) but not the mapping.
- **Where it bites:** `eventType` rows are stored **inert** in Phase 1 (§10.9); no holdings math is derived from them yet.
- **Proposed Phase-2 direction:** a position tracker that infers ratios / handles symbol-swaps from the event rows (aided by the `securityId` change across a merger, OQ-R); verify against real corporate-action examples.

#### 13.1.16 OQ-P — Income-Tail Enum Mappings (D4)

- **What it is:** The coarse `cashflowType` mappings for the income tail should be validated against real files: `SLIP`/`GDBP` → **INCOME**; `LCAP`/`SCAP`/`MDIV` → **DIVIDEND**; `GDBP` (a promo bonus) counted in XIRR.
- **Where it bites:** `cashflowType` + `includeInXIRR` (§7.5) and the XIRR series (§10.2). The exact broker code is always kept in `rawAction`, so no granularity is lost and a mapping can be corrected later.
- **Proposed direction:** verify against real broker files/edge cases; `includeInXIRR` is flippable per row without re-modeling.

#### 13.1.17 OQ-Q — Fidelity `Action` Word-Sets & `Symbol` Reliability (D7)

- **What it is:** The Fidelity free-text `Action` classifier word-sets and the `Symbol`-column reliability were derived from the dummy file (0 ties / 0 unmapped on 319 rows); they need verifying against a real multi-year export (rare verbs — average-price, agency-cross, transfers, fee-reversals — and confirmation that `Symbol` is populated on all security rows).
- **Where it bites:** The `classify` step (§10.9) and option-`extract` (which reads the `Symbol` column). A safe-fail to an `unmapped`/flagged row protects XIRR in the meantime.
- **Proposed direction:** validate against a real Fidelity export and extend the word-sets as needed.

#### 13.1.18 OQ-R — Security-Identifier Reliability (CUSIP / ISIN) (D8)

- **What it is:** `securityId` is captured where present — Robinhood CUSIP from `Description`, Zerodha `isin` column (§7.4). Needs verifying that Robinhood always formats it as `CUSIP: <id>` and that Zerodha ISIN is reliably populated on EQ rows / blank on FO.
- **Where it bites:** The `extract`/`direct` mapping of `securityId` (§10.9); Phase-1-inert (nothing reads it). Caveat: Fidelity provides **no** CUSIP/ISIN, so cross-broker id-linking is inherently one-sided.
- **Proposed Phase-2 direction:** validate against real exports; the identifier feeds the Phase-2 corporate-action/merger-leg matching (OQ-O) and cross-broker linking where it exists.

#### 13.1.19 OQ-S — Date Assumptions (`YY`→20`YY`, No Intraday Time) (D11)

- **What it is:** Date normalization assumes two-digit years map `YY`→20`YY` (samples are 24/25/26) and that Robinhood/Fidelity carry **no intraday time** (date-only), while Zerodha's ISO `order_execution_time` does.
- **Where it bites:** Date parsing (§10.9, D11) → the `YYYY-MM-DD` that seeds Trade/Cashflow `SK`s and the D2 dedup key. A malformed date safe-fails to a flagged row.
- **Proposed direction:** confirm both assumptions on a longer real export; the date-only vs intraday distinction also feeds the Phase-2 F&O open/close tracker (OQ-B).

#### 13.1.20 OQ-T — Zerodha IndexOption vs Option Classification (D10)

- **What it is:** In Phase 1 **all** Zerodha options normalize to `instrumentType = "Option"`; distinguishing `IndexOption` (NIFTY/BANKNIFTY/FINNIFTY/SENSEX/MIDCPNIFTY…) is not done.
- **Where it bites:** `instrumentType` on Trade (§7.4) and chart gating (§10.7 — options aren't charted anyway). Mirrors the Stock→ETF pattern of OQ-L.
- **Proposed Phase-2 direction:** a known-index-set / instrument lookup backfills `IndexOption`.

> **Why surface these as open questions rather than hide them?** Because each one is a place where the data itself is genuinely ambiguous, a deferred implementation choice, or a Phase-2 flow — not a modeling mistake — and a model that pretends otherwise quietly produces wrong numbers or false certainty. Naming them, pinning down exactly where each one affects a result, and proposing a direction means Phase 2 can close them deliberately instead of rediscovering them in production. (OQ-D, OQ-J are now **resolved**; OQ-K/OQ-M are **largely/partially resolved**; OQ-F and OQ-G are deferred choices that leave the model fully specified.) _(See §10.6; §11.14; §7.12; ADR-001, ADR-005, ADR-013.)_

### 13.2 Assumptions

These are the deliberate simplifications the Phase 1 model leans on. None is an accident; each is a conscious scope or design choice, recorded here so a future reader doesn't mistake it for an omission. The "Relied on at" column points to where the model depends on the assumption, and "Anchored by" names the ADR or section that justifies it.

| #       | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Relied on at                                              | Anchored by      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| **A-1** | **Tag names are stable in Phase 1.** A tag's name is its identity (`SK = TAG#<tagName>`), so creating the same tag twice is idempotent (safe to repeat). Renaming a tag is therefore non-trivial (it would touch the tag, its scorecard, the denormalized `tagNames` on entries, and the link items) and is not supported in Phase 1.                                                                                                                                                                                                                                                                 | §7.7 (Tag), §7.8 (link), §7.9 (scorecard), §10.4          | ADR-005          |
| **A-2** | **Current holdings are derived, not stored.** There is intentionally no Holdings item; current positions are computed by netting a user's Trade records (AP-14, §10.2). A live positions/portfolio view is out of scope (§1.5).                                                                                                                                                                                                                                                                                                                                                                       | §10.2, AP-14, §12.1                                       | ADR-001          |
| **A-3** | **Rate of return is per-currency, with no conversion.** USD and INR cashflows are kept apart (currency-first cashflow keys) and XIRR is computed separately per currency; the model never converts or combines currencies. A unified multi-currency figure is out of scope.                                                                                                                                                                                                                                                                                                                           | §7.5 (Cashflow), §10.2, §10.3, AP-13                      | ADR-007          |
| **A-4** | **Canonical symbol resolution is available when needed.** A `(broker, rawSymbol) → canonicalSymbol` mapping (the global SymbolMapping partition) is assumed resolvable at import, valuation, and evaluation time, so trades carry a stable `symbol` and the price cache is keyed by the canonical symbol. Unmapped symbols fall back to the raw symbol (treated as already-canonical).                                                                                                                                                                                                                | §7.4 (Trade), §9.2, §10.5, AP-26                          | ADR-010, ADR-012 |
| **A-5** | **The price-cache freshness window is application config, not schema.** How long a cached price is considered "fresh" (the value used to compute `expiresAt`) is an app-level setting, not a property of the data model. The model only assumes such a window exists and is applied on write (AP-29) and re-checked on read (§9.4).                                                                                                                                                                                                                                                                   | §9.3, §9.4, §9.5, AP-28/29                                | ADR-008          |
| **A-6** | **Identifier formats are illustrative placeholders.** Values like `u_alex`, `t_meta01`, `cf_div01` are examples, not a prescribed ID scheme. What the model requires is that trade/cashflow ids be **deterministic** functions of natural identity (for dedup); the exact string format is an implementation choice.                                                                                                                                                                                                                                                                                  | §1.6, §7.4, §10.1                                         | ADR-005          |
| **A-7** | **An instrument's currency is known at import.** The price-cache key folds **currency** into the partition key (`PRICE#<canonicalSymbol>#<currency>`) to disambiguate the same ticker across the USD and INR markets. Every ingested trade already carries its account `currency`, so the key is always populatable — unlike exchange, which only Zerodha's files supply. Same-currency, different-exchange listings (NSE vs BSE, both INR) intentionally share one cache entry; see the §13 accepted limitation.                                                                                                                                                                                                                                                                                       | §9.2, AP-28/29                                            | ADR-008, ADR-010 |
| **A-8** | **Per-user isolation is sufficient privacy for Phase 1.** Rooting every user-owned item at `PK = USER#<userId>` is treated as the isolation boundary; finer-grained controls (encryption-at-rest of account numbers, audit logging, soft deletes) are out of Phase 1 scope.                                                                                                                                                                                                                                                                                                                           | §2.2, §6.2, §10.3                                         | ADR-002          |
| **A-9** | **Authentication is via self-managed OAuth 2.0, verified upstream of every access pattern.** We run the OAuth/OIDC flow ourselves (Google Phase 1, Zerodha Phase 2 — no Cognito). Each request's provider token is verified against the provider's JWKS (Google) and its stable `sub` is mapped to our **internal `userId`** via the AuthIdentity item (§7.12) before any DynamoDB access; Beyond Folio then issues its **own session** (mechanism deferred — OQ-F). No passwords are stored; the `role` is app-managed on the `User` item; MFA is the provider's concern (out of scope for Phase 1). | §7.1 (User), §7.12 (AuthIdentity), §4.1 (AP-2b/2c), §12.1 | ADR-013, ADR-002 |

> **Why write the assumptions down at all?** Because an unstated assumption is indistinguishable from a bug to the next reader. Listing them — each tied to where the model relies on it and the ADR that backs it — means a Phase 2 contributor can see exactly which simplifications are safe to revisit and which are load-bearing, without having to reverse-engineer the intent from the keys. _(See ADR-001.)_
cks it — means a Phase 2 contributor can see exactly which simplifications are safe to revisit and which are load-bearing, without having to reverse-engineer the intent from the keys. _(See ADR-001.)_
contributor can see exactly which simplifications are safe to revisit and which are load-bearing, without having to reverse-engineer the intent from the keys. _(See ADR-001.)_
