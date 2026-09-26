# Tech Context — Beyond Folio

> Technology decisions and external dependencies.
> For full rationale see `DYNAMODB_DATA_MODEL.md` (§5 ADRs, §9 price cache, §13 open questions).

> **Current stack (2026-06-26).** The database is **Amazon DynamoDB**. This file supersedes the
> retired PostgreSQL-era tech stack (`DATA_MODEL_ANALYSIS.md` §16/§23 — historical only). The
> project pivoted PostgreSQL → DynamoDB on 2026-06-17; the model was designed fresh,
> access-pattern-first, purely from `FEATURES.md`.

---

## Database Engine — Amazon DynamoDB

A NoSQL, key-value/document store. The model uses **four tables**: main + price-cache + a dedicated auth **Sessions** table (TRD §5.4 / data model §9.7) + a temporary **Waitlist** table (data model §9.8; launch-gating, retired at full launch). The two core tables:

| Table                       | Role                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **`BeyondFolio`** (main)    | Durable, per-user single-table store for all user-owned data + the one global admin-owned symbol-change list |
| **Price-cache** (auxiliary) | Global, ephemeral cache of latest market prices, auto-expired via TTL                                        |

**Why DynamoDB (over the retired PostgreSQL design):**

| #   | Reason                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Per-user partition isolation** — rooting every key at `USER#<userId>` makes privacy a property of the data layout, not app-layer filtering (ADR-002)    |
| 2   | **Access-pattern-first fit** — known, bounded query set (AP-1…AP-34); the base table's key shapes serve nearly all of them, needing only 3 GSIs (ADR-001) |

| 3 | **Native TTL** — price cache auto-expires with zero clean-up code (ADR-008) |
| 4 | **Atomic counters** — tag scorecard `wins`/`losses` update concurrency-safely via `ADD` (ADR-006) |
| 5 | **Conditional writes** — deterministic keys + `attribute_not_exists` give idempotent, race-free two-layer dedup (ADR-005) |
| 6 | **AWS-native, on-demand** — serverless capacity fits the low, spiky Phase 1 load with no instance to manage |

---

## Key DynamoDB Mechanisms Used

| Mechanism                             | Where / Why                                                                                                                | ADR         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Composite primary key** (`PK`/`SK`) | Per-user partition + `TYPE#identifier` sort keys; item-type overloading in one table                                       | ADR-002/003 |
| **`entityType` attribute**            | Every item self-identifies independent of its key                                                                          | §6.3        |
| **Sparse GSIs**                       | GSI1 (trades-by-broker), GSI2 (journal-entries-by-tag), GSI3 (trades-by-ticker) — only relevant items carry the index keys | ADR-001     |

| **Conditional writes** (`attribute_not_exists`) | Idempotent file-level and record-level dedup | ADR-005 |
| **Atomic counters** (`UpdateItem` + `ADD`) | Tag scorecard win/loss/breakeven tallies | ADR-006 |
| **TTL** on `expiresAt` (epoch seconds) | Auto-expire cached prices; read rule treats expired-but-not-deleted as missing | ADR-008 |
| **Time-ordered sort keys** (`YYYY-MM-DD`) | Trade history + per-currency cashflow timeline return pre-sorted | ADR-009 |
| **Denormalization** | Copy small, stable data (tag names, symbol/currency) to avoid joins | ADR-004 |
| **Admin-owned BrokerMapper** | Per-file-type import recipe (`GLOBAL#BROKERMAPPER`): `headerFingerprint` auto-detect + `columnMapping` (direct/lookup/classify/extract) + normalization | ADR-015 |
| **Raw-file storage in S3** | Every confirmed import's original bytes saved to `<userId>/<contentHash>` (S3-first, then `ImportedFile.s3Key`); Phase-1 stores only | ADR-016 |

---

## Schema-Level Tech Decisions

| Decision          | Choice                                                                                                                                                                                               | Reference   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Keys              | `PK`/`SK` string tokens (`USER#<id>`, `TRADE#<date>#<id>`, etc.)                                                                                                                                     | §6.2, §7    |
| Dedup keys        | Deterministic fingerprints of natural identity for `tradeId` / `cashflowId` (+ per-broker distinguisher: Zerodha `brokerTradeId` / Fidelity `cashBalance` / RH `occurrence #N`) / file `contentHash` | ADR-005     |
| Currency handling | Stored per item; currency-first cashflow SK; no conversion                                                                                                                                           | ADR-007     |
| Cashflow sign     | Investor's perspective — into-investing negative, back-to-user positive                                                                                                                              | §10.2       |
| Symbol handling   | Canonical `symbol` + preserved `rawSymbol`; resolved via `GLOBAL#SYMBOLMAP`                                                                                                                          | ADR-010/012 |
| Cache write       | Plain last-write-wins overwrite (not conditional) — newest fetch should win                                                                                                                          | ADR-008     |
| Holdings          | Derived from Trade records — no stored Holdings item                                                                                                                                                 | ADR-001     |
| ID format         | Illustrative placeholders; only requirement is determinism for dedup                                                                                                                                 | §13 A-6     |

---

## External Dependencies

| Dependency                               | Purpose                                                                                 | Target                                                                             | Fallback                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Amazon S3 (raw-file store)**           | Retain every confirmed import's original file bytes for Phase-2 re-import / undo        | S3 bucket, key `<userId>/<contentHash>`, SSE-S3, Block Public Access, keep-forever | Backend-only; Phase-1 writes only (nothing reads them yet) (ADR-016)                                      |
| **External market-data service (US)**    | Current US stock/ETF prices (provider not locked — e.g. Yahoo Finance is a candidate)   | Price-cache table                                                                  | Use stale/absent → re-fetch; treat too-old price as missing (§9.4)                                        |
| **External market-data service (India)** | Current Indian (NSE/BSE) prices (provider not locked — e.g. an NSE feed is a candidate) | Price-cache table                                                                  | Same as above                                                                                             |
| **Historical market-data**               | 1-yr daily price series for the FR-H5 trade chart                                       | New `PRICEHIST#` cache (aux table, §9.6), keyed `(canonicalSymbol, currency)`      | Lazy fetch on first view, reused 1 day; providers: INR → Kite, USD → Twelve Data (OQ-E resolved, ADR-014) |

| **Broker CSV/XLSX files** | Source of all imported data — Robinhood (1 CSV), Fidelity (1 CSV), Zerodha (2 files: equity + F&O, each CSV **or** XLSX). _(Zerodha P&L/charges report not ingested in Phase 1 → INR XIRR excludes fees, OQ-I. USD fees from Fidelity commission/fees + Robinhood Gold **are** captured.)_ | `BeyondFolio` (Trade, Cashflow, BrokerAccount, ImportedFile, SymbolMapping) + raw bytes to **S3** (ADR-016) | Read via an admin-managed **BrokerMapper** matched by header fingerprint; a broker format change hard-stops the import until an **admin** updates the mapper, then the user re-uploads (ADR-015) |
| **Google OAuth 2.0 / OIDC** | Authentication identity provider for "Sign in with Google" (ADR-013) — verifies the user; we run the OAuth flow and verify its ID token against Google's JWKS. Zerodha is a Phase-2 provider. | Auth layer; `User` profile mirrors provider-supplied `email`/`displayName`; `sub` → internal `userId` via AuthIdentity (§7.12) | Provider outage blocks new sign-ins; existing sessions remain valid per our own session policy (OQ-F) |

Cache freshness window (how long a price is "fresh") is **app config**, not a schema concern (ADR-008, §13 A-5). The price-cache table's TTL is configured on the `expiresAt` attribute.

---

## Security Posture

| Item             | Approach                                                                                                                                                                                                                                          | Status           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Tenant isolation | Rooted in the key — every user-owned item is `PK = USER#<userId>`; a query cannot reach another user's partition (ADR-002)                                                                                                                        | **Hard rule**    |
| `user_id` source | Always from the authenticated session, never from an uploaded file                                                                                                                                                                                | **Hard rule**    |
| Global data      | Only `GLOBAL#SYMBOLMAP` (shared market facts) is not user-rooted; admin-write-only, contains no personal data (ADR-012)                                                                                                                           | Accepted         |
| Password / auth  | **Self-managed OAuth 2.0** (Google Phase 1, Zerodha Phase 2 — no Cognito); no passwords stored; provider token verified against its JWKS; `sub` → internal `userId` via AuthIdentity; **we own the session** (mechanism deferred, OQ-F) (ADR-013) | **Decided**      |
| MFA              | Handled by the identity provider (e.g. Google), not by us                                                                                                                                                                                         | Provider concern |
| Account numbers  | Encryption-at-rest not modeled in Phase 1                                                                                                                                                                                                         | Phase 2          |

---

## Assumptions the Stack Leans On (§13.2)

| #   | Assumption                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | Tag names are stable (name = identity; rename not supported in Phase 1)                                                                                                                                                                                    |
| A-2 | Holdings derived, not stored                                                                                                                                                                                                                               |
| A-3 | XIRR per-currency, no conversion                                                                                                                                                                                                                           |
| A-4 | Canonical symbol resolution available at import/valuation/evaluation                                                                                                                                                                                       |
| A-5 | Price-cache freshness window is app config                                                                                                                                                                                                                 |
| A-6 | ID formats illustrative; determinism (for dedup) is the only requirement                                                                                                                                                                                   |
| A-7 | An instrument's exchange/market is known or derivable (folded into price key)                                                                                                                                                                              |
| A-8 | Per-user key isolation is sufficient privacy for Phase 1                                                                                                                                                                                                   |
| A-9 | Authentication via self-managed OAuth 2.0 (Google P1, Zerodha P2), verified upstream of every access pattern; provider token → internal `userId` via AuthIdentity; we own the session (OQ-F); no passwords stored; MFA is the provider's concern (ADR-013) |

---

## Open Questions (Phase 1 accepted; §13.1)

| ID   | Description                                                                                                                                                                                   | Severity |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| OQ-A | **Narrowed by D2** — residual is Robinhood-only: identical same-day rows split across separate files collide (`occurrence #1` recomputed); Fidelity `cashBalance` / Zerodha `trade_id` immune | Low      |
| OQ-B | Zerodha F&O file has no open/close flag — affects derived holdings for XIRR                                                                                                                   | High     |
| OQ-C | DRIP record pattern (DIVIDEND only vs DIVIDEND + companion BUY) unverified per broker                                                                                                         | Medium   |
| OQ-E | Historical price series sourcing for the FR-H5 trade chart — provider + range/granularity to finalize (pattern settled: lazy fetch + 1-day-fresh `PRICEHIST#` cache, ADR-014)                 | Low      |
| OQ-F | Session/token strategy after sign-in (app-signed JWT vs. server session; refresh/logout/revocation) — deferred to TRD (ADR-013)                                                               | Medium   |

| OQ-G | Phase-2 account-linking (Google↔Zerodha) — second AuthIdentity → same `userId`; deferred to Phase 2 | Low |
| OQ-H | Admin user management (disable/delete a user) — stated but not modeled; **on hold** (would need a users-enumeration index + a 2nd exception to ADR-002 + a `status` flag on `User`) | Medium |
| OQ-I | Zerodha fees/charges omitted from INR XIRR in Phase 1 (charges live only in the non-ingested P&L report; tradebooks carry none) — INR return reads slightly optimistic, shown with a notice; capturing Zerodha charges deferred to Phase 2 | Medium |
| OQ-J | **Resolved (L7)** — Fidelity trade `Amount` is net of commission+fees; net `Amount` = cash leg, commission/fees display-only (not double-counted); per-column split is a non-blocking real-file spot-check | Low |
| OQ-K | **Largely resolved (D5)** — Fidelity external cashflows from EFT rows; SPAXX sweeps stored+hidden `includeInXIRR=false`; residual = verify transfer wording (w/ OQ-Q) | High→Low |
| OQ-L | Stock-vs-ETF classification (D6): Phase-1 default-Stock/upgrade-on-marker; Phase-2 lookup backfill | Low |
| OQ-M | **Partially resolved (D14)** — raw-file storage prerequisite met (S3 `s3Key`); reprocess + undo engine = Phase 2 | Medium |
| OQ-N | RSU vesting (D1/D4): JOURNALED-RSU tax→ADJUSTMENT excl; zero-cost share-in→BUY@0; verify vs real vesting | Low |
| OQ-O | Merger/split ratio interpretation (D3): files give qty not ratio; Phase-2 position tracker | Medium |
| OQ-P | Income-tail enum mappings (D4): SLIP/GDBP→INCOME, LCAP/SCAP/MDIV→DIVIDEND; verify vs real files | Low |
| OQ-Q | Fidelity `Action` word-sets + `Symbol` reliability (D7): verify vs real multi-year export; safe-fail meanwhile | Medium |
| OQ-R | Security-id reliability (D8): RH CUSIP-in-Description + Zerodha `isin`; Fidelity none; verify vs real exports | Low |
| OQ-S | Date assumptions (D11): `YY`→20`YY`; RH/Fidelity date-only, Zerodha ISO; confirm on longer export | Low |
| OQ-T | Zerodha IndexOption vs Option (D10): all Zerodha options→`Option` in Phase 1; Phase-2 known-index-set backfill | Low |

> **OQ-D resolved** — user profile provisioning is **first-login provisioning** (mint `userId` + write User & AuthIdentity idempotently on first sign-in; ADR-013).
>
> Note: the relational-era open questions OQ-006 / OQ-007 describe the retired PostgreSQL design and are reference-only. The DynamoDB model's single source of truth is `DYNAMODB_DATA_MODEL.md` (ADRs §5 + §13).

---

## Out-of-Scope for Phase 1

- No holdings/positions or P&L tables (holdings derived on demand)
- No analytics/dashboard aggregation
- No currency conversion / FX rates
- No audit log, soft deletes, or `deleted_at` (Phase 1 is delete-by-removing-items)
- No account-number encryption-at-rest
- No real-time price streaming (on-demand cache refresh only)
- No multi-region deployment

---

## Deployment Recommendation (AWS-native)

| Environment  | Recommended                                                                         |
| ------------ | ----------------------------------------------------------------------------------- |
| Local dev    | **DynamoDB Local** — `docker run -p 8000:8000 amazon/dynamodb-local`                |
| CI           | DynamoDB Local container, or a throwaway on-demand table                            |
| Phase 1 prod | DynamoDB **on-demand** capacity; TTL enabled on the price-cache table's `expiresAt` |
| Backups      | Point-in-time recovery (PITR) on the main `BeyondFolio` table                       |

---

## What Has NOT Been Decided Yet (Outside the Data Model)

- Backend language/framework (Node/TS, Python, Go, etc.)
- API style (REST, GraphQL, tRPC)
- Data-access layer (AWS SDK v3 DocumentClient, or a lightweight single-table library)
- Frontend framework
- IaC / deployment tooling (CDK, Terraform, SAM)
- **Session / token approach** — how a signed-in session is carried and ended (app-signed JWT vs. server session; refresh/logout/revocation) (OQ-F, §13.1.5). We run auth ourselves — provider is **decided: self-managed OAuth 2.0** (Google Phase 1, Zerodha Phase 2; ADR-013). Profile provisioning is **resolved** — first-login provisioning (OQ-D).
- **OAuth library / implementation** — which library or approach we use to run the OAuth 2.0 / OIDC authorization-code flow and verify provider tokens (Google JWKS).

These are intentionally left open until implementation begins.
