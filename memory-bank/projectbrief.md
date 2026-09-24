# Project Brief — Beyond Folio

## Elevator Pitch

**Beyond Folio** is a multi-broker investment portfolio management and trading journal application. Users import their trade history from multiple brokers — Robinhood, Fidelity, and Zerodha — into a single unified platform. The system consolidates all trades, calculates Extended Internal Rate of Return (XIRR) **per currency** (USD and INR separately; no conversion in Phase 1 — a combined base-currency return is Phase 2), and allows users to journal individual trades with notes, predictions, tags, and outcomes.

## Problem Solved

Investors who trade across multiple brokers (e.g., US equities on Robinhood, retirement on Fidelity, Indian derivatives on Zerodha) have no single place to view complete portfolio performance. Each broker provides its own export format, terminology, and has zero interoperability with the others. Beyond Folio is the unified import, storage, and analysis layer.

## Phase 1 Scope

### Supported Brokers (3)

| Broker | Market | Currency | File Format | Files per Import |
|---|---|---|---|---|
| Robinhood | US (NYSE / NASDAQ) | USD | CSV | 1 (equity + options) |
| Fidelity | US (NYSE / NASDAQ) | USD | CSV (single-account; equity + options) | 1 (Phase 1: single-account file → one Fidelity account; multi-account/combined file not supported until Phase 2) |
| Zerodha | India (NSE / BSE) | INR | CSV or XLSX (user's choice) | 2 (equity, F&O) — separate uploads |

### In-Scope Features

1. **Multi-Broker CSV/XLSX Import** — handling for **4 broker file types**: `ROBINHOOD_ACTIVITIES` (CSV), `FIDELITY_SINGLE_ACC_ACTIVITY` (CSV), `ZERODHA_EQUITY`, `ZERODHA_FO` (Zerodha files may be CSV **or** XLSX). *(Zerodha's P&L/charges report is **not** ingested in Phase 1 — see feature 3 and OQ-I. The import mechanism is **decided**: an admin-managed **BrokerMapper** per file type (header-fingerprint auto-detect + `columnMapping` + normalization, ADR-015) with raw files retained in S3 (ADR-016); D1–D14 all locked and written into the source docs.)*
2. **Unified Trade History View** — single query across all brokers/accounts/transaction types
3. **XIRR Calculation** — per-currency (USD, INR), uses the price cache for current portfolio valuation; holdings derived from Trade records (ADR-001). **USD (Robinhood/Fidelity) includes fees/commissions; INR (Zerodha) excludes fees in Phase 1** — Zerodha charges live only in a P&L report not ingested in Phase 1, so the INR figure is shown with a fee-exclusive notice; capturing Zerodha charges is Phase 2 (OQ-I).
4. **Trading Journal** — multiple entries per trade, with notes, prediction (BULLISH/BEARISH/NEUTRAL), tags, system-computed result via Evaluate button, per-tag W/L scoring on TagScorecard counters (ADR-006)
5. **Price Data Cache** — external market-data services (US + India), TTL-based refresh, dual-purpose (XIRR + Evaluate)
6. **Two-Layer Deduplication** — file-level content hash + trade-level deterministic `tradeId`/`cashflowId` (ADR-005)
7. **User Accounts & Authentication** — self-managed OAuth 2.0 (Google Phase 1, Zerodha Phase 2); no passwords; provider `sub` mapped to our internal `userId` via AuthIdentity; `user`/`admin` roles (app-managed); sessions TBD (OQ-F); MFA is the provider's concern (ADR-013)
8. **Trade Price Chart (FR-H5)** — on an equity trade (Stock/ETF only), a historical price chart with a circle marker per user buy/sell (green=buy, red=sell; no P/L in Phase 1); historical series via ephemeral `PRICEHIST#` cache, lazy fetch + 1-day freshness (ADR-014); realized P/L on sells deferred to Phase 2




### Out-of-Scope (Phase 2+)

- Holdings / Portfolio View
- Realized / Unrealized P&L
- Analytics / Dashboard aggregation tables
- Currency conversion / multi-currency unified XIRR — a **combined base-currency XIRR** (user-toggled base: USD or INR) computed by converting **each cashflow at its own date's FX rate** then running a single XIRR; needs a historical + current FX-rate source and supersedes ADR-007's "no conversion" for that view. Per-currency XIRR remains the always-correct primary figure.
- Audit log / soft deletes (Phase 1 uses hard deletes only)
- Custom user-defined instruments
- Order lifecycle management
- Encryption-at-rest for account numbers (flagged for Phase 2)
- **Undo an import** (delete an import job and everything it created) — PRD §6, O6
- Zerodha login + account-linking (Google↔Zerodha as one account)

## User Roles

| Role | Permissions | Data Visibility |
|---|---|---|
| `user` | Import files, view own trades, write journal entries, manage tags | Own data only — structurally guaranteed by per-user key rooting (`PK = USER#<userId>`, ADR-002) |
| `admin` | Manually correct corporate-action symbol map (user management — disable/delete users — deferred; see OQ-H) | Own data + the shared global config (SymbolMapping) |

## Scale Expectations (Phase 1)

- **Users:** Tens of users (personal-use / small-scale deployment)
- **Transactions:** 500–2,000 rows per user per year
- **Total DB size:** Well under 1 GB
- **Concurrency:** Low — concurrent imports possible but rare

## Key Documents

| Doc | Purpose |
|---|---|
| `FEATURES.md` | Plain-language feature source of truth (Phase 1). |
| `PRD.md` | Product Requirements Document — the _what_ and _why_. |
| `DYNAMODB_DATA_MODEL.md` | Authoritative DynamoDB data model (ADRs, item shapes, GSIs, access patterns). |
| `TRD.md` | Technical Requirements Document — the _how_ (planned; companion to the PRD). |
| `memory-bank/` | Persistent AI-session context (this directory). |

> **Historical only (retired relational design, in `unimportant/`):** `MASTER_REQUIREMENTS.md` (D-001…D-039, OQ-006/OQ-007), `DATA_MODEL.md`, `DATA_MODEL_ANALYSIS.md`, `DB_ALTERNATIVES_ANALYSIS.md`. The PostgreSQL design was superseded by DynamoDB (2026-06-17); these are reference-only.
