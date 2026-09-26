# Beyond Folio

Multi-broker investment portfolio tracker and trading journal. Beyond Folio consolidates **Robinhood, Fidelity, and Zerodha** trade history into one view, computes honest **per-currency XIRR** (USD/INR, never blended), and turns every trade into a journaled, tag-scored prediction.

> **Status:** Phase 1 — planning complete, implementation starting. This repository is a ground-up **DynamoDB / serverless** rebuild; the earlier PostgreSQL-era design lives in a separate legacy repository.

## What it does

- **Import** — upload the statement files brokers already export (Robinhood CSV, single-account Fidelity CSV, Zerodha equity + F&O CSV/XLSX). A two-gate async flow (Proceed → preview → Confirm) normalizes and de-duplicates every row.
- **Unified history** — all trades across brokers in one chronological view, filterable by broker and ticker.
- **XIRR** — a true rate of return per currency (USD and INR kept separate, no conversion), valuing current holdings at live prices.
- **Journal** — notes + a Bullish/Bearish/Neutral prediction per trade, with multiple tags.
- **Evaluate & scorecard** — mark a prediction Win/Loss/Breakeven; each tag carries a running win/loss tally.
- **Trade price chart** — an equity ticker's price line with the user's own buy/sell markers (FR-H5).

## Architecture

AWS-native **serverless**, TypeScript end to end:

| Layer         | Choice                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend      | Single **Next.js** app (public + authenticated)                                                              |
| API           | **tRPC** on **AWS Lambda** (`app-api`, `import-api`, `admin-api`, `auth-api`) + an SQS `import-worker`       |
| Data          | **DynamoDB** — 4 tables: `BeyondFolio` (main, single-table), Price-Cache, Sessions, and a temporary Waitlist |
| Data access   | **ElectroDB** (main table) + raw AWS SDK v3 DocumentClient (cache/sessions)                                  |
| Auth          | Self-managed **OAuth 2.0 / OIDC** (Google in Phase 1; Zerodha in Phase 2), hybrid JWT + refresh token        |
| Market data   | Provider abstraction routed **by currency** — INR → Zerodha Kite, USD → Twelve Data                          |
| Hosting / IaC | **OpenNext** on Lambda + CloudFront + S3; **AWS CDK** (TypeScript)                                           |
| CI/CD         | GitHub Actions + AWS OIDC; gate-less deploy to prod on merge to `main`                                       |

## Repository layout

Documentation-first; the codebase is scaffolded as a pnpm monorepo workspace.

| Path                          | Contents                                                  |
| ----------------------------- | --------------------------------------------------------- |
| `apps/`                       | Frontend application(s) — the Next.js web app             |
| `services/`                   | Backend Lambdas — the tRPC APIs and the SQS import worker |
| `packages/`                   | Shared internal packages (types, DynamoDB helpers)        |
| `infra/`                      | AWS CDK deployment app                                    |
| `docs/PRD.md`                 | Product requirements (the _what_ and _why_)               |
| `docs/FEATURES.md`            | User-facing feature catalog                               |
| `docs/TRD.md`                 | Technical requirements (the _how_)                        |
| `docs/DYNAMODB_DATA_MODEL.md` | Single-table data model, access patterns, ADRs            |
| `docs/PHASE_1_BACKLOG.md`     | Epics and tasks, dependency-ordered                       |
| `docs/SETUP_PREREQUISITES.md` | Accounts, tooling, and pinned choices needed to build     |
| `memory-bank/`                | Design decision log and working context                   |

## Toolchain (pinned)

- **Package manager:** pnpm workspaces (`node-linker=hoisted` for Lambda-friendly bundling)
- **Test runner:** Vitest
- **Node:** pinned LTS via `.nvmrc` / Corepack

See `docs/SETUP_PREREQUISITES.md` for the full prerequisite checklist.

## Getting started

```bash
# 1. Install dependencies (pnpm is provisioned via Corepack)
pnpm install

# 2. Start the web app locally
pnpm dev
```

Scaffolding the project locally needs only Node, pnpm (via Corepack), Docker, the AWS CLI, and the AWS CDK CLI — no cloud account required. See `docs/SETUP_PREREQUISITES.md` for the full prerequisite checklist.

## Commands

All commands are run from the repository root and fan out across the workspace:

| Command             | What it does                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Start the Next.js web app in development mode (hot reload)                                                     |
| `pnpm typecheck`    | Type-check every package — `tsc --build` for the backend/shared packages plus Next's own check for the web app |
| `pnpm build`        | Produce production build output for all packages                                                               |
| `pnpm lint`         | Run ESLint across the repository                                                                               |
| `pnpm test`         | Run the Vitest test suite once                                                                                 |
| `pnpm format`       | Auto-format the codebase with Prettier                                                                         |
| `pnpm format:check` | Check formatting without modifying files (used in CI)                                                          |
| `pnpm clean`        | Remove TypeScript build output and incremental caches                                                          |

The `typecheck` and `build` scripts deliberately split the composite backend/shared packages (built with `tsc --build`) from the Next.js web app (which type-checks itself via `next build`), because a Next app is not a composite TypeScript project.
