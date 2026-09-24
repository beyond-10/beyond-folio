# System Patterns — Beyond Folio

> The DynamoDB data architecture, key invariants, and access patterns at a glance.
> For full detail (item shapes, GSIs, example items), see `DYNAMODB_DATA_MODEL.md`.

> **Current design (2026-06-26).** The project's database is **Amazon DynamoDB**, designed
> access-pattern-first purely from `FEATURES.md`. This file supersedes the retired 11-table
> PostgreSQL relational design (`DATA_MODEL.md`, `DATA_MODEL_ANALYSIS.md` — historical only).
> The underlying *requirements* (per-user isolation, two-layer dedup, atomic tag counters,
> multi-currency, symbol resolution) carry over; their relational *implementations* (FKs,
> UNIQUE constraints, ENUMs, CASCADE) do not.

---

## The Tables

> **Note (updated 2026-09-22):** the model is now **four tables** — the two below **plus a dedicated `Sessions` table** for auth refresh tokens (TRD §5.4 / data model §9.7) **plus a temporary `Waitlist` table** for launch-gating signups (data model §9.8; retired at full launch). The two-table framing below predates both and is retained for the main-vs-price-cache rationale.


| | **`BeyondFolio`** (main) | **Price-cache** (auxiliary) |
|---|---|---|
| **Purpose** | System of record for everything a user owns + the one shared symbol-change list | Short-lived cache of latest market prices |
| **Ownership** | Per-user (`PK = USER#<userId>`), plus one global/admin partition for symbol mappings | Global / shared — one price per symbol+exchange |
| **Lifecycle** | Durable | Ephemeral — auto-expires via TTL |
| **What lives here** | User, BrokerAccount, ImportedFile, Trade, Cashflow, JournalEntry, Tag, JournalEntry↔Tag link, TagScorecard, SymbolMapping (global), BrokerMapper (global), AuthIdentity (login lookup) | PriceCache + PriceHistory entries |
| **Ref** | `DYNAMODB_DATA_MODEL.md` §6–§8 | §9 |

**Why split tables (ADR-003):** one table keeps a user's related data co-located for single-query reads; the price cache is split out because it is *shared* (one price serves everyone) and *ephemeral* (should auto-expire) — it would otherwise pollute the durable per-user store.

---

## Key Structure (Main Table)

- **Composite primary key:** `PK` (partition — the "folder") + `SK` (sort — the "filing label").
- **Per-user rooting (ADR-002):** every user-owned item is `PK = USER#<userId>`. A read aimed at one user's folder structurally cannot return another user's items — isolation is a property of the layout, not app-layer filtering.
- **Sort-key token style:** `TYPE#identifier` (e.g. `ACCOUNT#...`, `TRADE#...`, `TAG#...`), so many item types coexist in one partition and are told apart by `SK` prefix (item-type overloading, §6.3).
- **Time in the key (ADR-009):** where results must be ordered (trade history, XIRR cashflow timeline), the date is built into the `SK` (`YYYY-MM-DD`), so queries return already sorted.
- **`entityType` attribute:** every item self-identifies (e.g. `"Trade"`) independent of its key — aids debugging, streams, migrations.
- **The admin-owned exceptions (ADR-012, ADR-015):** two shared, admin-owned record types are **not** filed under a user — the symbol-change list (`PK = GLOBAL#SYMBOLMAP`) and the import recipes (`PK = GLOBAL#BROKERMAPPER`, one `MAPPER#<fileType>` per broker file type). Both stay in the main table (durable, isolated by their distinct partitions).

---

## The Item Types

| Item type | `PK` | `SK` | Primary APs |
|---|---|---|---|
| User | `USER#<userId>` | `PROFILE` | AP-1, AP-2 |
| BrokerAccount | `USER#<userId>` | `ACCOUNT#<accountId>` | AP-3, AP-4 |
| ImportedFile | `USER#<userId>` | `FILE#<contentHash>` | AP-5, AP-6 |
| Trade | `USER#<userId>` | `TRADE#<date>#<tradeId>` | AP-8, AP-10, AP-12 |
| Cashflow | `USER#<userId>` | `CASHFLOW#<currency>#<date>#<cashflowId>` | AP-9, AP-13 |
| JournalEntry | `USER#<userId>` | `TRADE#<tradeId>#JOURNAL#<entryId>` | AP-15, AP-16, AP-17, AP-22 |
| Tag | `USER#<userId>` | `TAG#<tagName>` | AP-18, AP-19 |
| JournalEntry↔Tag link | `USER#<userId>` | `JTAG#<tagName>#<entryId>` | AP-20, AP-21 |
| TagScorecard | `USER#<userId>` | `TAGSCORE#<tagName>` | AP-23, AP-24, AP-25 |
| SymbolMapping (global) | `GLOBAL#SYMBOLMAP` | `SYMBOL#<broker>#<rawSymbol>` | AP-26, AP-27 |
| BrokerMapper (global) | `GLOBAL#BROKERMAPPER` | `MAPPER#<fileType>` | AP-33, AP-34 |
| AuthIdentity (login lookup) | `AUTH#<provider>#<providerSub>` | `AUTH` | AP-2b, AP-2c |
| PriceCache (aux table) | `PRICE#<canonicalSymbol>#<currency>` | *(no SK)* | AP-28, AP-29 |
| PriceHistory (aux table) | `PRICEHIST#<canonicalSymbol>#<currency>` | *(no SK)* | AP-31, AP-32 |


- **AuthIdentity** is the login lookup that maps `(provider, providerSub) → userId` (§7.12); like SymbolMapping it is **not** user-rooted (at login the `userId` isn't yet known). Written idempotently (`attribute_not_exists`) on first sign-in; a second provider identity pointing at the same `userId` is how Phase-2 account-linking works.


- `tradeId` / `cashflowId` are **deterministic fingerprints** of natural identity (dedup key).
- Trade stores both `symbol` (canonical, resolved) and `rawSymbol` (as-imported).
- **No Holdings item** — current positions are *derived* by netting Trade records (out of scope §1.5).

---

## The 3 GSIs

| Index | `GSInPK` | `GSInSK` | Populated by | Serves |
|---|---|---|---|---|
| **GSI1** — Trades by broker | `USER#<userId>#BROKER#<broker>` | `TRADE#<date>#<tradeId>` | Trade items (sparse) | AP-11 (trades filtered to one broker) |
| **GSI2** — Journal entries by tag | `USER#<userId>#TAG#<tagName>` | `JOURNAL#<entryId>` | JournalEntry↔Tag link items (sparse) | AP-21 (entries for a tag → scorecard view) |
| **GSI3** — Trades by ticker | `USER#<userId>#SYM#<canonicalSymbol>` | `TRADE#<date>#<tradeId>` | Trade items (sparse) | AP-30 (trades filtered to one ticker) |

- All three keep `userId` inside the partition key, so isolation survives into the index (ADR-002).
- Everything else is served by the **base table's primary key** — the §7 key shapes were designed *for* those queries, so only these three alternate paths are needed (no orphan indexes, §8.4).
- Only items that carry a GSI's key attributes appear in it (sparse). The **Trade** item feeds **GSI1 and GSI3** (it carries `GSI1PK/SK` and `GSI3PK/SK`); the **JournalEntry↔Tag link** item feeds **GSI2** (it carries `GSI2PK/SK`). Ticker uses the **canonical** symbol so a rename (FB→META) keeps a ticker's history unified (ADR-010).

---

## Key Invariants (Rules That Must Always Hold)

1. **Per-user isolation is rooted in the key (ADR-002).** Every user-owned item is `PK = USER#<userId>`. Privacy is structural, not a `WHERE` clause.
2. **`user_id` comes from the authenticated session, never from a file.** Import must never trust an id from a CSV/XLSX.
3. **Two-layer deduplication via deterministic keys + conditional writes (ADR-005).**
   - Layer 1 — file level: `SK = FILE#<contentHash>` written with `attribute_not_exists(PK)`.
   - Layer 2 — record level: `tradeId`/`cashflowId` derived from natural identity; written with `attribute_not_exists(PK)`. Repeats are safe no-ops.
4. **A buy/sell is both a Trade and a Cashflow (ADR-011).** History reads Trades; XIRR reads Cashflows. Deposits/withdrawals/dividends/fees are Cashflow-only. Both written once, together.
5. **Cashflow `amount` is signed from the investor's perspective (§10.2).** `DEPOSIT`/`BUY`/`FEE` negative; `WITHDRAWAL`/`SELL`/`DIVIDEND` positive; derived terminal holdings valuation positive.
6. **Currency is the first segment of the Cashflow sort key (ADR-007).** `CASHFLOW#<currency>#<date>#<id>` → one currency's timeline is a single prefix query; USD and INR never blended.
7. **Tag scorecards are atomic counters (ADR-006).** On Evaluate, each tag on the entry gets `wins`/`losses`/`breakeven` bumped with `ADD`. Reads are O(1); no aggregation.
8. **Holdings are derived, never stored (ADR-001).** Netted from Trade records on demand; no Holdings item.
9. **Symbols resolve through one shared list (ADR-010).** `(broker, rawSymbol) → canonicalSymbol` via `GLOBAL#SYMBOLMAP` at import, valuation, and evaluation. Trades preserve `rawSymbol`.
10. **The price cache is not a system of record (ADR-008).** Global, ephemeral, TTL-expired; treat expired-but-not-yet-deleted as missing; writes are plain last-write-wins overwrites.
11. **Authentication is self-managed OAuth 2.0 (ADR-013).** We run the OAuth/OIDC flow ourselves — **Google** Phase 1, **Zerodha** Phase 2; no Cognito. Each request's provider token is verified against the provider's JWKS (Google), its stable `sub` is mapped to our **internal `userId`** via the **AuthIdentity** lookup item (§7.12), and Beyond Folio then issues its **own session** (mechanism deferred — OQ-F). `userId` is our own id (not the provider `sub`); `role` (`user`/`admin`) is **app-managed** on the `User` item; no passwords are stored; MFA is the provider's concern.



---

## Denormalizations (Intentional — ADR-004)

| What | Why |
|---|---|
| `tagNames` copied onto each JournalEntry | "Fetch entry with its tags" (AP-17) is one read, not one-per-tag |
| `symbol` + `currency` copied onto JournalEntry | Evaluation/display needs no trade re-read |
| `accountId`, `broker`, `currency` copied onto Trade/Cashflow | Filter/order by account and currency without a lookup |
| `wins`/`losses`/`breakeven` pre-computed on TagScorecard | Scorecard read is O(1); no scan of entries |
| `relatedTradeId` on BUY/SELL Cashflows | Links the cash leg back to its Trade (ADR-011) |

Rule: only copy data that is **small and rarely changes**; when a copied value can change, every copy must be updated (e.g. `tagNames` on attach/detach).

---

## The 16 Design Decisions (ADRs — full text in §5)


| ADR | Decision |
|---|---|
| ADR-001 | Access-pattern-first — no entity/key/index without an AP that needs it |
| ADR-002 | Per-user data isolation, rooted in the key (`PK = USER#<userId>`) |
| ADR-003 | Single table by default; price cache is the one purposeful exception |
| ADR-004 | Denormalize over joins (DynamoDB has no joins) |
| ADR-005 | Idempotency & conditional writes (deterministic keys + `attribute_not_exists`) |
| ADR-006 | Pre-computed aggregates via atomic counters (`ADD`) |
| ADR-007 | Currency isolation — no conversion; XIRR per currency |
| ADR-008 | TTL for ephemeral data (price cache auto-expiry) |
| ADR-009 | Model time in the sort key for chronological access |
| ADR-010 | Stable symbol resolution through one maintained mapping |
| ADR-011 | Trade and Cashflow are separate concepts |
| ADR-012 | SymbolMapping is global / admin-owned (sole exception to ADR-002) |
| ADR-013 | Authentication via self-managed OAuth 2.0 (Google P1, Zerodha P2); verify provider token → map `sub` to internal `userId` via AuthIdentity; app-managed `role`; our own session (OQ-F) |
| ADR-014 | Trade price chart (FR-H5): **equity-only (Stock/ETF)**; markers reuse Trades via GSI3 (buy=green, sell=red circles, no P/L in Phase 1); historical price line = new ephemeral `PRICEHIST#` cache (§9.6), lazy fetch + 1-day freshness; scoped to trade's ticker+currency; P/L on sells deferred to Phase 2 |
| ADR-015 | Admin-managed **BrokerMapper** + a distinct normalization step: one shared/admin-owned recipe per file type (`headerFingerprint` auto-detects broker+file type; hard-stop on no match), `columnMapping` of four kinds (`direct`/`lookup`/`classify`/`extract`); normalization = transaction catalogue, option parse, date + number cleanup, `rawAction` preserved, safe-fail; accountId find-or-create by `(userId, broker)` |
| ADR-016 | Raw uploaded-file storage in **S3**: every confirmed import saves original bytes to `<userId>/<contentHash>` (S3-first, before the `ImportedFile` record which carries the relative `s3Key`); SSE-S3, Block Public Access, keep-forever, backend-only; Phase 1 stores only (reprocess/undo = Phase 2) |



---

## Access Patterns (AP-1 … AP-34, grouped)


| Area | APs | Notes |
|---|---|---|
| Users & Accounts | AP-1…AP-4 | base table, `PROFILE` / `ACCOUNT#` prefix |
| Import & Mapper | AP-5…AP-9, AP-33, AP-34 | file-hash dedup; BrokerMapper match on upload (AP-33) + admin CRUD (AP-34) |
| Import & Dedup | AP-5…AP-9 | `FILE#<hash>`, deterministic trade/cashflow ids, conditional writes |
| Trade History | AP-10…AP-12, AP-30 | `TRADE#` prefix (all brokers); GSI1 for one broker (AP-11); GSI3 for one ticker (AP-30) |
| XIRR | AP-13, AP-14 | `CASHFLOW#<currency>#` prefix; holdings **derived** from trades |
| Journal & Tags | AP-15…AP-21 | nested journal keys; `tagNames` denorm; GSI2 for tag→entries (AP-21) |
| Evaluation & Scorecard | AP-22…AP-25 | `UpdateItem` on entry; atomic `ADD` on TagScorecard |
| Symbol Resolution | AP-26, AP-27 | `GLOBAL#SYMBOLMAP` |
| Prices | AP-28, AP-29 | price-cache table; `GetItem` + freshness check; TTL overwrite |
| Trade Price Chart | AP-31, AP-32 | historical-series `PRICEHIST#` cache; lazy fetch + 1-day freshness (markers reuse AP-30/GSI3) |

Full AP → operation/key/ADR mapping: `DYNAMODB_DATA_MODEL.md` §12.

---

## Handling the Tricky Requirements (§10)

| Requirement | Mechanism |
|---|---|
| Two-layer dedup | File hash key + deterministic record ids (with per-broker distinguisher: Zerodha `brokerTradeId` / Fidelity `cashBalance` / Robinhood `occurrence #N`), both guarded by `attribute_not_exists` |
| XIRR | Per-currency cashflow prefix query (AP-13) + terminal valuation from **derived holdings** (AP-14) × price cache |
| Per-broker | `accountId` + `broker` on each item; GSI1 for per-broker view (Phase 1 = one account per broker) |
| Multi-currency | Currency-first cashflow SK; computed separately per currency, never summed |
| Journal↔Tags (M:M) | `tagNames` denorm (entry→tags) + link items via GSI2 (tag→entries) |
| Evaluation → scorecard | Write `evaluation` on entry, then atomic `ADD` per tag |
| Corporate actions | Canonical symbol resolution at import/valuation/evaluation |

---

## Estimated Scale (Phase 1)

- Tens of users; **500–2,000 trades per user per year**; total data well under 1 GB.
- DynamoDB on-demand capacity comfortably covers this; price-cache table stays small via TTL.

---

## Known Soft Spots (carried to §13)

| ID | Description |
|---|---|
| OQ-A | **Narrowed by D2** — residual is Robinhood-only: two identical same-day rows split across separate files (each recomputes `occurrence #1`) collide; Fidelity `cashBalance` / Zerodha `trade_id` are immune |
| OQ-B | Zerodha F&O file has no open/close flag — affects derived holdings for XIRR |
| OQ-C | DRIP record pattern (DIVIDEND only vs DIVIDEND + companion BUY) unverified per broker |
| OQ-D | **Resolved** — user profile provisioning is **first-login provisioning** (mint `userId` + write User & AuthIdentity, `attribute_not_exists`; ADR-013) |
| OQ-F | Session/token strategy after sign-in — app-signed JWT vs. server session, refresh/logout/revocation (deferred to TRD; ADR-013) |
| OQ-E | Historical price series sourcing for the FR-H5 trade chart — **RESOLVED**: providers chosen (INR → Zerodha Kite, USD → Twelve Data), routed by currency; cache keyed `(canonicalSymbol, currency)`; pattern = lazy fetch + 1-day-fresh `PRICEHIST#` cache, ADR-014. NSE/BSE same-INR collapse accepted (data model OQ-E2) |
| OQ-G | Phase-2 account-linking (Google↔Zerodha) — link a second AuthIdentity to the same `userId`; flow + conflict handling deferred to Phase 2 |
| OQ-H | Admin user management (disable/delete a user) — stated but not modeled; **on hold** (would need a users-enumeration index + a 2nd deliberate exception to ADR-002, plus a `status` flag on `User`) |
| OQ-I | Zerodha fees/charges omitted from INR XIRR in Phase 1 (charges live only in the non-ingested P&L report; tradebooks carry none) — INR return reads slightly optimistic (shown with a notice); Zerodha charges deferred to Phase 2. USD (Fidelity/Robinhood) fees **are** captured. |
| OQ-J | **Resolved (L7)** — Fidelity trade `Amount` is net of commission+fees; net `Amount` used as the cash leg, commission/fees display-only (not double-counted); residual per-column split is a non-blocking real-file spot-check |
| OQ-K | **Largely resolved (D5)** — Fidelity external cashflows captured from `Electronic Funds Transfer Received/Paid`; SPAXX sweeps stored+hidden `includeInXIRR=false`; residual = verify transfer-row wording (w/ OQ-Q) |
| OQ-L | Stock-vs-ETF classification (D6): Phase-1 default-Stock/upgrade-on-ETF-marker; Phase-2 authoritative lookup backfill |
| OQ-M | **Partially resolved (D14)** — raw-file storage prerequisite met (S3 `s3Key`); retroactive re-import + undo-an-import engine = Phase 2 |
| OQ-N | RSU vesting (D1/D4): JOURNALED-RSU tax → ADJUSTMENT `includeInXIRR=false`; zero-cost share-in → BUY@0; verify vs real vesting event |
| OQ-O | Merger/split ratio interpretation (D3): event rows give qty not ratio; Phase-2 position tracker infers |
| OQ-P | Income-tail enum mappings (D4): `SLIP`/`GDBP`→INCOME, `LCAP`/`SCAP`/`MDIV`→DIVIDEND; verify vs real files (`includeInXIRR` flippable) |
| OQ-Q | Fidelity `Action` word-sets + `Symbol` reliability (D7): verify vs real multi-year export; safe-fail meanwhile |
| OQ-R | Security-id reliability (D8): RH CUSIP-in-`Description` + Zerodha `isin`; Fidelity has none; verify vs real exports |
| OQ-S | Date assumptions (D11): `YY`→20`YY`; RH/Fidelity date-only, Zerodha ISO; confirm on longer export |
| OQ-T | Zerodha IndexOption vs Option (D10): all Zerodha options tagged `Option` in Phase 1; Phase-2 known-index-set backfill (mirrors OQ-L) |



