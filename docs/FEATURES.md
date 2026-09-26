# Beyond Folio — Features & Requirements

> A plain-language description of what Beyond Folio does. No technical jargon — anyone should be able to read this and understand what we're building.

---

## 1. What Is Beyond Folio?

Beyond Folio is an investment portfolio management and trading journal application. Many investors spread their trades across several brokers, which makes it hard to see the full picture in one place. Beyond Folio solves this by letting users bring their trading history from multiple brokers together into a single, unified platform.

With Beyond Folio, a user can:

- See all of their trades from every broker in one place.
- Understand the true performance (rate of return) of their overall portfolio.
- Keep a journal of their trades — recording why they made each decision, what they predicted, and whether it worked out.

This document describes the **Phase 1** scope only.

---

## 2. Who Uses It

| User                  | What they do                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trader / Investor** | Imports their trades, browses their full trading history, writes journal entries, and sees their portfolio's rate of return.                           |
| **Admin**             | Manages the platform — corrects corporate-action symbol mappings. (Disabling/deleting user accounts is not yet decided — on hold; see Open Questions.) |

**Privacy:** Every user only ever sees their own data. One person's trades, journals, and account information are never visible to anyone else.

---

## 3. Supported Brokers

Beyond Folio works with three brokers in Phase 1:

| Broker        | Market        | Currency      |
| ------------- | ------------- | ------------- |
| **Robinhood** | United States | US Dollars    |
| **Fidelity**  | United States | US Dollars    |
| **Zerodha**   | India         | Indian Rupees |

Users bring their data in by uploading the statement files their broker provides. For **Robinhood** and **Fidelity**, a single **CSV** file covers everything (both equity and futures & options / options transactions). For **Zerodha**, **two** separate files are uploaded — one for equity trades and one for futures & options trades — and each of those can be either a **CSV or an XLSX** file (Zerodha lets the user choose the format when downloading).

---

## 4. What You Can Track

Beyond Folio supports a wide range of investment types, depending on the broker:

- **Stocks** (shares of individual companies)
- **ETFs** (exchange-traded funds)
- **Options** — both calls and puts
- **Index Options** — such as NIFTY, BANKNIFTY, and SENSEX (India)
- **Mutual Funds & Money Market Funds**
- **Retirement (401k) Fund Allocations**
- **Fractional Shares** (owning a portion of a single share)

---

## 5. Core Features (Phase 1)

### 5.1 Import Your Trades

Users upload the statement files from their brokers, and Beyond Folio automatically reads and understands them — turning raw broker statements into a clean, organized trading history. You never type in your trades by hand — Beyond Folio does the reading for you. After you upload a file you tap **Proceed to Import**; Beyond Folio then reads it **in the background** (so you can carry on or even close the tab) and shows you a **preview of what it understood** — the trades and cash activity it will add, plus any rows it can't support and will skip. You look it over and tap **Confirm** to save it. Beyond Folio lets you know when the preview is ready and when the import is done.

> **One note for Fidelity:** in Phase 1, please upload an **individual-account** Fidelity file. Fidelity can also export a single combined file covering several accounts at once — that multi-account format isn't supported yet, so if you upload one Beyond Folio will recognize it and ask you to download an individual-account file instead. (Support for the combined multi-account file is planned for a future phase.)

### 5.2 No Duplicate Imports

The app is smart about avoiding duplicates:

- If a user accidentally uploads the **same file** again, the app recognizes it and won't import it twice.
- Even if individual trades overlap across uploads, the app makes sure the **same trade isn't recorded twice**.

This means users can re-upload files without worrying about messing up their data.

### 5.3 Unified Trade History

All trades from all brokers are shown together in a single, combined view. Instead of logging into multiple broker apps, users get one complete picture of everything they've traded.

### 5.4 Portfolio Rate of Return (XIRR)

Beyond Folio calculates the true performance of a user's portfolio — accounting for the timing of every deposit, withdrawal, buy, sell, dividend, and fee, as well as the current value of what they still hold. This gives users a realistic rate of return **for each currency** they invest in — USD and INR are shown as separate figures, with no conversion or blending in Phase 1 (a combined, base-currency return is a Phase 2 item).

**A note on fees in Phase 1:** the **US (USD) return — Robinhood and Fidelity — includes fees and commissions**, because those charges appear in the broker files we import (Fidelity provides commission and fee columns; Robinhood reports its charges — e.g. Gold subscription, account, and regulatory fees — as their own rows). The **India (INR) return — Zerodha — is calculated _without_ fees/charges** in Phase 1: Zerodha reports its charges (brokerage, STT, GST, stamp duty, etc.) only in a separate profit/charges report that Phase 1 does not import, and its equity/F&O trade files carry no per-trade charges. So the INR figure is shown with a **clear notice that it excludes fees/charges/commissions**, and it will read slightly better than reality. Including Zerodha charges is planned for Phase 2.

### 5.5 Trading Journal

Users can keep a journal attached to their trades. For any trade, they can record:

- **Notes** — free-form thoughts about the trade.
- **A Prediction** — whether they expected the market to go up (bullish), down (bearish), or stay flat (neutral).
- **Tags** — labels they define themselves (for example, "swing trade", "earnings play", or the name of an analyst/source they followed). A single journal entry can have **multiple tags** attached to it (for example, an entry tagged both "swing trade" and "earnings play").

In short, the structure works on two levels: a single trade can have **multiple journal entries**, and a single journal entry can have **multiple tags**. Having multiple entries per trade is useful when a user wants to log different predictions from different sources for the same trade — for example, one entry for a prediction from "Money Control" and another for a prediction from a friend or analyst. (If a user has no trades yet, the app prompts them to import trades to start journaling.)

### 5.6 Evaluate a Prediction

For any journal entry, the user can click an **"Evaluate"** button. Beyond Folio then checks the current market price against the trade and marks the entry as a **Win**, **Loss**, or **Breakeven**. This lets users see, after the fact, whether their prediction actually played out — and they stay in control of when to evaluate.

### 5.7 Source Scorecard (Tag Performance)

Because tags can represent information sources or strategies, Beyond Folio keeps a running win/loss record for each tag. Every time a journal entry is evaluated, its tags pick up a win or a loss. Over time, this lets users see **which sources or strategies actually have the best track record** — for example, discovering that predictions tagged "Money Control" have been right more often than another source.

### 5.8 Up-to-Date Prices

To value a portfolio and evaluate predictions, Beyond Folio needs current market prices. It fetches the latest prices from external market data services and reuses them for a short time, so the app stays responsive and doesn't make unnecessary repeated lookups.

### 5.9 Corporate Action Handling

Sometimes a company's ticker symbol changes — due to mergers, spin-offs, acquisitions, name changes, and similar events. Beyond Folio keeps track of these changes so that old symbols are correctly recognized as their current equivalent. This keeps a user's trade history accurate and consistent even when symbols change over time. These changes are detected automatically during import, and an admin can also add or correct them when needed.

### 5.10 Multiple Accounts & Currencies

- A single user can bring in trades from **multiple brokers** (Robinhood, Fidelity, Zerodha), each kept distinct. In Phase 1 each broker has a single account, fed by that broker's single-account file; holding **multiple accounts within the same broker** (e.g. a Fidelity Individual + Roth + 401k shown separately, from a combined multi-account file) is planned for Phase 2.
- Beyond Folio handles both **US Dollars and Indian Rupees**. In Phase 1, amounts are kept in their original currency — there is no currency conversion between the two.

### 5.11 User Accounts & Authentication

Beyond Folio requires each person to have their own secure account, so that a user only ever sees their own data. Sign-in is handled entirely through **"Sign in with Google"** (OAuth 2.0) — there are **no passwords** to create, store, or reset. Beyond Folio never handles credentials; Google verifies the user's identity and email.

- **Sign in with Google:** A user signs in with their existing Google account. On their **first** sign-in, an account is created for them automatically.
- **Log out:** Users can log out at any time.
- **Roles:** Every account is either a normal **user** (a trader/investor) or an **admin** (who manages the platform and can correct corporate-action symbol mappings).

**Planned (Phase 2):** "Sign in with Zerodha" as an additional login option, and linking a Google and a Zerodha login to the same Beyond Folio account.

Multi-factor authentication (MFA) is handled by the identity provider (e.g. Google), not by Beyond Folio.

### 5.12 Trade Price Chart with Transaction Markers

When a user opens one of their **equity trades** (a **stock** or an **ETF**), Beyond Folio shows a price chart for that ticker — its historical price over a **selectable range (1 month / 6 months / 1 year)** — so the user can see their activity in the context of how the price moved.

- **Transaction markers:** every one of the user's buys and sells of that ticker is drawn on the chart as a **marker** at the price and date it happened. If the user did 3 buys and 2 sells, the chart shows 5 markers. Buys are shown as **green circles** and sells as **red circles** (here red simply means "a sell", not a loss).
- **Hover tooltip:** hovering over a marker shows the transaction's **type** (buy/sell), **date**, **price**, and **quantity**.
- **All accounts, one market:** the chart gathers the user's transactions for that ticker across **all of their accounts** — but only those in the **same market/currency** as the trade they opened. (For a ticker that trades in more than one market — e.g. an Indian rupee listing and a US dollar listing of the same company — each market gets its own chart, so a rupee price line and a dollar price line are never mixed.)
- **Equities only:** the chart is shown for **stocks and ETFs**. For options, index options, and mutual/money-market/retirement funds, no chart is shown — instead the trade detail notes that a price chart isn't available for that instrument type.

The historical price data behind the chart is fetched from an external market-data service the first time it's needed and reused for the rest of the day, so opening the same ticker's chart repeatedly doesn't trigger repeated lookups.

> **Planned (Phase 2):** each **sell** marker will also show the **realized profit/loss** for that sale, with sells coloured green (profit) or red (loss) and shown as up/down triangles. This needs a cost-basis method (e.g. average-cost or FIFO) and is deferred so Phase 1 shows only the factual buy/sell markers, never a computed profit/loss number.

---

## 6. What's Intentionally NOT in Phase 1

To keep the first version focused, the following are explicitly out of scope for now:

- **Holdings / Portfolio View** — a live breakdown of current positions is not included.
- **Realized / Unrealized Profit & Loss** — detailed profit/loss reporting is not included. _(The per-trade price chart in §5.12 deliberately shows only factual buy/sell markers, not any computed profit/loss; adding realized P/L to sell markers is a Phase 2 item.)_
- **Analytics / Dashboard** — analytical dashboards and portfolio-wide summary charts are not included. _(This does not exclude the single per-trade price chart described in §5.12, which shows one ticker's price with the user's own buy/sell markers.)_

These may be considered for future phases.

---

## 7. Known Limitations & Open Questions

These are honest, known gaps and pending decisions in Phase 1 — described in plain terms. **Some items once open have since been settled and are marked "decided" / "mostly decided" below**; the rest are genuine known limitations or still-open questions.

### Known Limitation

- **Identical same-day cash transfers (Robinhood):** If a user makes two cash transfers (deposits or withdrawals) of the **exact same amount on the same day**, the app may treat them as a single transfer and record only one. This is a rare situation and is accepted as a known limitation for Phase 1. (This affects **Robinhood only** — Fidelity and Zerodha files carry information that keeps such transfers distinct.)

### Settled (how Fidelity charges are handled)

- **Fidelity commission/fees columns:** the Fidelity file has separate "commission" and "fees" columns, but the transaction's own **Amount is already net of them** — so Beyond Folio uses that net Amount directly and keeps the commission/fees as **display-only detail**. They are **not** added again as separate charges (doing so would double-count them and understate the US return). The only remaining follow-up is a non-blocking spot-check of the exact per-column split against a wider set of real Fidelity files; it doesn't change how the numbers are computed.

### Open Questions (pending decisions)

- **Zerodha futures & options — open vs. close:** For Zerodha's futures and options trades, the broker file doesn't clearly say whether a trade is _opening_ a new position or _closing_ an existing one. How best to figure this out automatically is still being worked out and discussed.
- **Dividend reinvestment handling:** When a dividend is automatically reinvested, it's not yet fully confirmed how the broker files report it, and therefore how it should be reflected in the portfolio return calculation. This needs to be verified against real broker files before it's finalized.
- **Staying signed in (session strategy) — decided:** After a user signs in with Google, Beyond Folio keeps them signed in using a short-lived sign-in token plus a longer-lived, revocable "refresh" credential (so signing out — and being signed out — works reliably). This is a behind-the-scenes decision that doesn't change what the user sees; the mechanism is settled in the technical design.
- **Account linking (Phase 2):** In Phase 2, a user who signs in with both Google and Zerodha should be recognized as the _same_ Beyond Folio account rather than two separate ones. Exactly how these two logins are linked together is still to be worked out and is deferred to Phase 2.
- **Historical price data for the trade chart (§5.12) — mostly decided:** The approach is settled — fetch a ticker's daily price series the first time it's needed and reuse it for the rest of the day — and the chart offers **selectable 1-month / 6-month / 1-year** views. The one remaining item is **which external market-data service** supplies the series (to be confirmed against the chosen provider, especially for Indian tickers); it doesn't change what the user sees.
- **Admin user management (on hold):** whether an **admin** can **disable** (block login, keep data) or **delete** (permanently remove) a user account is being considered but is **not yet decided** and is currently **on hold** — it is not part of Phase 1. In Phase 1 an admin only corrects corporate-action symbol mappings.
- **Zerodha fees/charges omitted from INR return (Phase 1):** Zerodha's charges (brokerage, STT, GST, stamp duty, etc.) appear only in a separate profit/charges report that Phase 1 does not import, and the equity/F&O trade files carry no per-trade charges. So the **INR rate of return is calculated without fees** and reads slightly better than reality; the figure is shown with a notice saying so. (US returns _do_ include fees.) Bringing Zerodha charges into the INR return is planned for Phase 2 — the exact mechanism is still to be worked out.
