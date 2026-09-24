# Product Context — Beyond Folio

## The Problem

A retail investor who is even modestly active will likely hold accounts across multiple brokers — for example:

- **Robinhood** for casual US stock and options trading
- **Fidelity** for an employer 401(k) and a long-term IRA
- **Zerodha** for Indian equities and F&O trades

Each broker:
- Provides its own CSV/XLSX export format
- Uses its own terminology (`BUY` vs `YOU BOUGHT` vs `buy`)
- Reports trades, fees, and dividends in incompatible structures
- Has no interoperability with any other broker

**Result:** No single place to see "what is my total portfolio doing?" The investor has to mentally stitch three+ data silos together. XIRR is impossible to compute across brokers without manual spreadsheet work.

## The Solution

Beyond Folio is a **unified import, storage, and analysis layer**. The user uploads broker exports; the system normalizes everything into one consistent data model so trades from all brokers can be viewed together and analysed.

## Target Persona

**Active retail investor / trader** — typically:
- Holds 2–4 broker accounts across 1–2 countries
- Trades equities, ETFs, mutual funds, options, F&O
- Wants a clear rate-of-return (XIRR) figure per currency (USD and INR separately; no conversion in Phase 1)
- Journals trades to learn from patterns over time
- Tracks "which information sources do I trust?" via tagged predictions

This is a **personal-finance power user**, not a casual investor and not an institutional user.

## Key UX Flows (High-Level)

### Flow 1 — Initial Onboarding
1. User **signs in with Google**, then continues (first sign-in provisions their account automatically — first-login provisioning).
2. User uploads broker file(s).


3. System detects the broker+file type (header fingerprint), parses, dedups, and finds-or-creates the broker account by `(user, broker)` on the fly — after the user confirms the uploaded file (one-time confirmation; no manual trade entry).
4. User sees unified trade history immediately.

### Flow 2 — Periodic Re-Import
1. User downloads a fresh export from broker (full history).
2. User uploads. File-level dedup (Layer 1) catches if file is identical; trade-level dedup (Layer 2) silently skips already-imported rows.
3. Only new rows added.

### Flow 3 — Trade History View
- Single chronological list across all brokers and accounts.
- Filter by broker, account, instrument, transaction category, date range.
- Click a trade → see options details, journal entries, raw broker action string.
- For an **equity** trade (Stock/ETF), the detail view also shows a **price chart** of that ticker with a circle marker per buy/sell (green=buy, red=sell; hover → type/date/price/qty). Historical series via ephemeral `PRICEHIST#` cache, lazy-fetched + 1-day-fresh (ADR-014, FR-H5). Options/funds show a fallback (no chart). Phase 1 shows factual markers only — realized P/L on sells is Phase 2.


### Flow 4 — XIRR Display
- Computed on demand from the user's Cashflow items (one currency's timeline is a single `CASHFLOW#<currency>#` prefix query).
- Open positions valued at the current price-cache price (treated as hypothetical sell); holdings are **derived** by netting Trade records (no Holdings item).
- Per-currency display (USD portfolio XIRR, INR portfolio XIRR — separate, no FX conversion in Phase 1).

### Flow 5 — Journal a Trade
1. User opens a trade.
2. User adds a journal entry: `notes`, `prediction` (BULLISH/BEARISH/NEUTRAL), `tags` (e.g., "Money Control", "Shrivatsav", "earnings play").
3. User can add **multiple journal entries** per trade — one per prediction source.
4. Later, user clicks **Evaluate** → system fetches latest price, writes the `evaluation` (WIN / LOSS / BREAKEVEN) on the entry, and atomically bumps `wins`/`losses`/`breakeven` on every tag's TagScorecard (ADR-006).

### Flow 6 — Tag Scoreboard
- "How reliable is each information source I follow?"
- UI shows a list: `Money Control: 7W / 2L`, `Shrivatsav: 4W / 5L`, `earnings play: 12W / 3L`.
- Direct read of each tag's TagScorecard counters — no aggregation needed.

> **Note:** "Undo an import" (delete an import job and everything it created) is **out of Phase 1** — deferred to Phase 2 (PRD §6, O6). Phase 1 has no user-facing delete flow.

## Key Domain Concepts

| Term | What It Means Here |
|---|---|
| **Trade** | A buy or sell of a security (stock, ETF, option, fund, etc.) — the unit of the unified history view. |
| **Cashflow** | Any money movement — deposit, withdrawal, dividend, fee, and the cash leg of a buy/sell. A buy/sell produces both a Trade and a Cashflow (ADR-011). |
| **Broker Account** | One account at one broker. In Phase 1 each user has **one per broker** (fed by that broker's single-account file); multiple accounts within one broker is a Phase-2 extension. |
| **Options details** | Strike/expiry/call-put carried inline on the Trade item (`optionDetails` map), present only for options — no separate table. |
| **Journal Entry** | User-authored note + prediction on one trade. Multiple per trade allowed. |
| **Tag** | User-defined label applied to journal entries; each tag carries a running W/L tally on its TagScorecard. |
| **Price Cache** | Latest market price per `(canonicalSymbol, exchange)`, refreshed on demand from external APIs; ephemeral/TTL (ADR-008). |
| **Authentication** | **Self-managed OAuth 2.0** — "Sign in with Google" now, "Sign in with Zerodha" in Phase 2 (no Cognito). We verify the provider's token and map its `sub` to our own internal `userId`; no passwords are stored. Roles: `user` / `admin`, **app-managed** by Beyond Folio (ADR-013). |



## What This Product Is NOT

- Not a trading platform — Beyond Folio cannot place orders.
- Not a market data terminal — only stores prices needed for portfolio valuation.
- Not a tax tool — no cost-basis tracking, no realized gains computation in Phase 1.
- Not a robo-advisor — no recommendations, no auto-rebalancing.
