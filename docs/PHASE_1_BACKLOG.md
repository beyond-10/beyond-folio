# Beyond Folio — Phase 1 Engineering Backlog

> **What this file is.** The ordered build plan for Phase 1 of Beyond Folio. Each task defines what to build and the criteria that prove it is done. Implementation decisions (which library, how to structure a module) are left to the developer; the source of truth for those is the TRD.
> **How to use it.** Work top-to-bottom within each epic. A task is not "done" until every acceptance criterion is checked off and the demo works. Dependencies listed on a task must be complete before that task starts.
> **Cross-reference conventions.** `TRD §N` = Technical Requirements Document section · `FR-*` = PRD functional requirement · `ADR-NNN` = Architecture Decision Record in `DYNAMODB_DATA_MODEL.md` §5 · `AP-N` = access pattern in `DYNAMODB_DATA_MODEL.md` §4 · `data model §N` = `DYNAMODB_DATA_MODEL.md` section.

---

## Phase 1 Scope Guardrails

**In scope — must be built:**
Google OAuth sign-in · 4 broker file types (Robinhood, Fidelity single-account, Zerodha EQ, Zerodha F&O) · two-gate async import with deduplication · unified trade history with broker and ticker filters · per-currency XIRR (USD incl. fees, INR fee-exclusive with notice) · trading journal with tags and evaluation · per-tag win/loss scorecard · FR-H5 equity price chart (1M/6M/1Y) · market-data provider abstraction · admin BrokerMapper and SymbolMapping management · public landing page + waitlist · AWS CDK infrastructure · OpenNext hosting · GitHub Actions CI/CD.

**Out of scope — do not build:**
Holdings/positions view · realized/unrealized P&L · analytics dashboards · currency conversion · undo-an-import · Zerodha login or account linking · multiple accounts per broker · account-number encryption-at-rest · admin user disable/delete · realized P&L on chart markers · chart ranges >1Y · MFA · websockets/push notifications · staging environment · formal SLOs/SLAs.

---

## Epic Map

| ID  | Epic                           | Goal                                                                         | Tasks  |
| --- | ------------------------------ | ---------------------------------------------------------------------------- | ------ |
| E1  | Project & Foundation           | Monorepo, CDK skeleton, CI/CD pipeline, OpenNext hosting live                | 6      |
| E2  | Public Site & Waitlist         | Landing page on domain with working waitlist capture                         | 4      |
| E3  | Data-Access Layer              | ElectroDB entities, GSIs, dedup helpers, price-cache/sessions SDK            | 6      |
| E4  | Auth & Session                 | Google OAuth flow, hybrid tokens, sessions table, tRPC middleware            | 7      |
| E5  | Shared Backend Platform        | All 4 tRPC servers wired, Zod, typed errors, logging, secrets                | 5      |
| E6  | Import: Upload & Detection     | Pre-signed upload, status spine, file dedup, broker detect, Gate 1           | 6      |
| E7  | Import: Worker & Parsers       | SQS worker, 4 broker parsers, symbol resolution, normalization, Gate 2 write | 10     |
| E8  | Trade History & XIRR           | Unified history, broker/ticker filters, per-currency XIRR                    | 6      |
| E9  | Journal, Tags & Scorecard      | Journal CRUD, tag M:M, Evaluate, atomic scorecard counters                   | 6      |
| E10 | Trade Price Chart              | getChartSeries, PRICEHIST cache, 1M/6M/1Y, buy/sell markers                  | 4      |
| E11 | Market-Data Integration        | Provider abstraction, adapters, current-price + history caching              | 5      |
| E12 | Private App UI                 | All authenticated Next.js pages wired to the backend                         | 9      |
| E13 | Admin, Observability & Testing | admin-api, alarms, never-log audit, full test tier in CI                     | 6      |
|     |                                | **Total**                                                                    | **80** |

---

## Epic 1 — Project & Foundation

> **Goal.** A greenfield repository with a working TypeScript monorepo, a deployable CDK app skeleton, and a CI/CD pipeline that lints, type-checks, tests, and deploys on merge. OpenNext hosting is wired so the Next.js app renders a placeholder page on the live domain.
> **Outcome.** Any developer can clone the repo, run one command to start the full stack locally, open a PR and see CI pass, and merge to trigger an automatic deploy to production. No application features exist yet — only the machinery that everything else deploys through.
> **Infrastructure note.** This epic provisions only the two genuinely shared foundations (the CDK app and OpenNext hosting) plus the WAITLIST table needed by E2. Every other AWS resource is provisioned just-in-time in the epic that first uses it.

---

### E1-T1 — Initialise the TypeScript monorepo

| Field      | Value          |
| ---------- | -------------- |
| Type       | Enabler        |
| Priority   | P0             |
| Status     | To Do          |
| Depends on | —              |
| Implements | TRD §3.1, §8.1 |

**Description**
Scaffold the repository as a TypeScript monorepo using **pnpm workspaces** (DECIDED — see `docs/SETUP_PREREQUISITES.md` "Choices to pin"). Pin the pnpm version via Corepack (`packageManager` field in root `package.json`) and add a root `.npmrc` with **`node-linker=hoisted`** (flat `node_modules` so downstream CDK/OpenNext + esbuild Lambda bundling stays trouble-free). Create the top-level workspace (`pnpm-workspace.yaml`) with packages for the Next.js frontend, the four API Lambdas (`app-api`, `import-api`, `admin-api`, `auth-api`), the import worker, the CDK infrastructure app, and shared utility packages (shared types, shared DynamoDB access helpers). Configure TypeScript, ESLint, and Prettier consistently across all packages.

**Acceptance Criteria**

- [ ] The repository has a clear top-level workspace configuration and a documented package layout
- [ ] `tsc --noEmit` passes with zero errors across all packages from the root
- [ ] ESLint runs from the root and reports zero errors on the initial scaffold
- [ ] A single root-level command (`pnpm dev` or equivalent) starts the Next.js app _(deferred: starting the local Lambda functions moves to E1-T3, where DynamoDB Local + LocalStack provide the backend runtime the services need; at scaffold stage the services are empty placeholders with no handlers to run)_
- [ ] A `README.md` at the root documents the package layout and the commands a developer needs to get started

**Demo**
Clone the repo on a fresh machine, run the install and dev commands, and confirm the Next.js placeholder page loads in the browser with no console errors.

---

### E1-T2 — Set up the AWS CDK app skeleton

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E1-T1    |
| Implements | TRD §8.1 |

**Description**
Create the CDK app (TypeScript) that will define all AWS infrastructure for Beyond Folio. At this stage the stack is a skeleton — it compiles and deploys cleanly but defines only the resources needed for E1 and E2 (OpenNext hosting and the WAITLIST table). All other resources are added in later epics. Define a CDK context pattern for environment-specific config (table names, region, domain) so local, CI, and prod can share the same CDK definitions with different config.

**Acceptance Criteria**

- [ ] `cdk synth` completes with zero errors and produces a valid CloudFormation template
- [ ] The CDK app is written in TypeScript and lives in the monorepo as its own package
- [ ] Environment-specific config (table names, region, domain) is read from CDK context or environment variables — no hardcoded prod values in the stack code
- [ ] `cdk deploy` against a dev AWS account or LocalStack creates the stack without errors and can be re-run idempotently
- [ ] `cdk destroy` cleanly removes all resources the stack created

**Demo**
Run `cdk synth` and show the CloudFormation template output. Run `cdk deploy` against a dev account and confirm the stack appears in the AWS Console (or LocalStack equivalent).

---

### E1-T3 — Configure DynamoDB Local and LocalStack for local development

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E1-T2    |
| Implements | TRD §8.3 |

**Description**
Set up DynamoDB Local (for the DynamoDB tables — at E1 only WAITLIST exists; the main, price-cache, and sessions tables are added by later epics, four in total across Phase 1) and LocalStack (for S3 and SQS) so the full backend stack runs entirely offline during development. Provide a `docker-compose.yml` or equivalent that starts both services with a single command. Add a local bootstrap script that creates the tables and S3 bucket so a developer does not need a real AWS account to run the app locally.

**Acceptance Criteria**

- [ ] Running one command (e.g. `docker compose up`) starts DynamoDB Local and LocalStack with no manual configuration steps
- [ ] A single root-level command (`pnpm dev` or equivalent) starts the Next.js app together with the local Lambda functions against DynamoDB Local / LocalStack _(deferred here from E1-T1, which scaffolded the frontend-only `pnpm dev`)_
- [ ] The local bootstrap script creates all required DynamoDB tables (using the same table names and key schemas as the CDK stack) and the S3 bucket
- [ ] The application packages read endpoint/region config from environment variables so they can target DynamoDB Local or real AWS without code changes
- [ ] Running the bootstrap script twice is idempotent — it does not error if tables/buckets already exist
- [ ] The `README.md` documents the local setup steps end-to-end

**Demo**
Run `docker compose up`, run the bootstrap script, and confirm the DynamoDB tables provisioned so far (WAITLIST at E1) and the S3 bucket exist in DynamoDB Local / LocalStack using the AWS CLI or a DynamoDB Local UI.

---

### E1-T4 — Set up GitHub Actions CI pipeline

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E1-T1    |
| Implements | TRD §8.4 |

**Description**
Create a GitHub Actions workflow that runs on every pull request and push to `main`. The CI gate must pass before a PR can merge. The pipeline runs: install → lint → type-check → unit tests → integration tests (against DynamoDB Local and LocalStack, spun up as service containers in the workflow). Authentication to AWS uses OIDC role assumption — no long-lived AWS keys are stored as CI secrets.

**Acceptance Criteria**

- [ ] A GitHub Actions workflow file exists and triggers on pull requests and pushes to `main`
- [ ] The pipeline runs lint, `tsc --noEmit`, unit tests, and integration tests in that order; a failure at any step fails the whole pipeline
- [ ] DynamoDB Local and LocalStack run as service containers in the workflow; integration tests target them, not a real AWS account
- [ ] AWS authentication uses OIDC (no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` stored in GitHub Secrets)
- [ ] Branch protection on `main` requires the CI workflow to pass before a merge is allowed
- [ ] The pipeline completes in under 5 minutes on the initial scaffold (no application code yet)

**Demo**
Open a test PR with an intentional lint error; confirm CI fails and the merge button is blocked. Fix the error; confirm CI passes and the merge button is unblocked.

---

### E1-T5 — Configure OpenNext hosting and wire the Next.js app to CDK

| Field      | Value          |
| ---------- | -------------- |
| Type       | Enabler        |
| Priority   | P0             |
| Status     | To Do          |
| Depends on | E1-T2          |
| Implements | TRD §8.2, §3.3 |

**Description**
Configure the Next.js app to be deployed via OpenNext onto AWS (Lambda + CloudFront + S3), defined and deployed through the CDK stack. At this stage the app serves only a placeholder page — no features. The goal is to prove the hosting pipeline works end-to-end so E2 can ship a real page on the domain without infrastructure risk.

**Acceptance Criteria**

- [ ] The CDK stack includes an OpenNext construct that packages and deploys the Next.js app
- [ ] Deploying the CDK stack serves the Next.js placeholder page over HTTPS via CloudFront
- [ ] The page is served from the project's domain (or a CloudFront URL if domain wiring is deferred to E2)
- [ ] No host-specific Next.js features (e.g. Vercel-only APIs) are used; the app uses only standard Next.js capabilities
- [ ] A full deploy (CDK build + Next.js build + deploy) completes without manual steps from a clean checkout

**Demo**
Run the deployment pipeline and open the CloudFront/domain URL in the browser; the placeholder page loads over HTTPS with no errors.

---

### E1-T6 — Set up automated CD to production on merge

| Field      | Value        |
| ---------- | ------------ |
| Type       | Enabler      |
| Priority   | P0           |
| Status     | To Do        |
| Depends on | E1-T4, E1-T5 |
| Implements | TRD §8.4     |

**Description**
Extend the GitHub Actions pipeline with a deployment job that runs automatically when a PR merges to `main`. The job builds the backend Lambda bundles and the Next.js/OpenNext package, then runs `cdk deploy` to push changes to the production AWS environment. There is no manual approval gate. CloudFormation's built-in rollback handles a failed deploy. OIDC is used for AWS authentication (same as CI).

**Acceptance Criteria**

- [ ] Merging a PR to `main` triggers the deploy job automatically with no manual step
- [ ] The deploy job runs only after the CI gate (lint, type-check, tests) passes — a failed CI gate prevents deployment
- [ ] AWS authentication in the deploy job uses OIDC; no long-lived keys are stored
- [ ] A deliberately broken deploy (e.g. invalid CDK template) triggers CloudFormation rollback automatically; the previous working version remains live
- [ ] The deployment pipeline is documented in the `README.md` with the required AWS IAM role and OIDC trust policy configuration

**Demo**
Merge a trivial change (e.g. a README update) to `main`; watch the Actions tab and confirm the deploy job runs to completion and the production URL still serves the placeholder page.

---

## Epic 2 — Public Site & Waitlist 🆕

> **Goal.** A live public landing page on the Beyond Folio domain that explains what the product does and lets visitors join a waitlist by submitting their email address.
> **Outcome.** A visitor who lands on the domain sees a real page (not a placeholder), can submit their email, and receives confirmation. The submitted email is stored in a DynamoDB `WAITLIST` table. An admin can query the table directly to retrieve the waitlist. This ships early — before any application features — for market traction.
> **New scope note.** The waitlist feature (DynamoDB table + public endpoint) is not in the PRD, FEATURES, or TRD as domain scope. It was agreed during backlog planning and is flagged here so the scope addition is visible. It has since been recorded in the data model as a **fourth, temporary table** (data model §9.8) and in the TRD table inventory (§7.1). **It is temporary launch-gating scaffolding:** once the app is fully live and open signup is enabled, the `WAITLIST` table, the `POST /waitlist` endpoint, and the landing-page form are **retired together**, and Google login becomes the direct entry point. No data migration is needed — the waitlist is operational, not domain state.

---

### E2-T1 — Provision the WAITLIST DynamoDB table in CDK

| Field      | Value                  |
| ---------- | ---------------------- |
| Type       | Enabler                |
| Priority   | P1                     |
| Status     | To Do                  |
| Depends on | E1-T2                  |
| Implements | TRD §8.1 (CDK pattern) |

**Description**
Add a `WAITLIST` DynamoDB table to the CDK stack. The table stores waitlist signups with the visitor's email as the partition key, a `joinedAt` ISO timestamp, and an optional `source` attribute (e.g. `"landing-page"`). On-demand capacity. No GSIs needed — the only access patterns are write-one and scan-all (admin only).

**Acceptance Criteria**

- [ ] The CDK stack defines a `WAITLIST` table with `email` (String) as the partition key and on-demand capacity
- [ ] The table has no sort key and no GSIs
- [ ] `cdk deploy` creates the table without errors; `cdk synth` shows it in the CloudFormation template
- [ ] The table name is read from CDK context / environment config, not hardcoded
- [ ] No other Lambda or service has IAM access to this table except the public waitlist endpoint Lambda (to be scoped in E2-T2)

**Demo**
After `cdk deploy`, confirm the `WAITLIST` table exists in the AWS Console (or DynamoDB Local equivalent) with the correct key schema.

---

### E2-T2 — Build the public waitlist API endpoint

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Type       | Feature                                |
| Priority   | P1                                     |
| Status     | To Do                                  |
| Depends on | E2-T1                                  |
| Implements | TRD §4.1 (HTTP endpoint pattern), §9.5 |

**Description**
Create a public (unauthenticated) HTTP `POST /waitlist` endpoint that accepts an email address, validates it, writes it to the `WAITLIST` table, and returns a confirmation. The endpoint must be rate-limited to prevent abuse. Duplicate email submissions are silently accepted (idempotent) — no error, no duplicate row.

**Acceptance Criteria**

- [ ] `POST /waitlist` with a valid email returns HTTP 200 and a confirmation message
- [ ] A valid email is written to the `WAITLIST` table with `email`, `joinedAt` (current UTC ISO string), and `source: "landing-page"`
- [ ] Submitting the same email a second time returns HTTP 200 and does not create a duplicate row in the table
- [ ] `POST /waitlist` with a missing or malformed email (no `@`, empty string) returns HTTP 400 with a descriptive error message
- [ ] The endpoint enforces a rate limit (e.g. max 5 requests per IP per minute); exceeding it returns HTTP 429
- [ ] No email address appears in CloudWatch logs

**Demo**
`curl -X POST /waitlist -d '{"email":"test@example.com"}'` returns 200. Check the `WAITLIST` table — one item exists. Submit the same email again — still one item. Submit a bad email — get 400.

---

### E2-T3 — Build the public landing page

| Field      | Value                      |
| ---------- | -------------------------- |
| Type       | Feature                    |
| Priority   | P1                         |
| Status     | To Do                      |
| Depends on | E1-T5, E2-T2               |
| Implements | TRD §3.3 (Next.js SSR/SSG) |

**Description**
Build the public landing page in the Next.js app as a statically generated (SSG) or server-side rendered (SSR) page. The page explains what Beyond Folio is and includes the waitlist signup form. The page must be indexable by search engines (real HTML content, not a client-rendered shell). No authentication is required to view it.

**Acceptance Criteria**

- [ ] The landing page is accessible at the root URL (`/`) without signing in
- [ ] The page renders meaningful HTML content on the server — a `curl` of the URL returns the page content, not an empty shell
- [ ] The page includes a waitlist signup form with an email input and a submit button
- [ ] Submitting a valid email calls `POST /waitlist` and shows a success confirmation to the visitor without a full page reload
- [ ] Submitting an invalid email shows an inline validation error without calling the API
- [ ] The page title and meta description are set for SEO

**Demo**
Open the root URL in a browser — the landing page loads. Submit an email and see the success confirmation. Run `curl <url>` and confirm the HTML response contains the page content.

---

### E2-T4 — Wire the domain and confirm the public site is live

| Field      | Value                        |
| ---------- | ---------------------------- |
| Type       | Enabler                      |
| Priority   | P1                           |
| Status     | To Do                        |
| Depends on | E2-T3                        |
| Implements | TRD §8.2 (CloudFront/domain) |

**Description**
Point the Beyond Folio domain at the CloudFront distribution created by OpenNext. Configure HTTPS (ACM certificate). After this task the public landing page is live on the real domain and the waitlist is open for signups.

**Acceptance Criteria**

- [ ] The domain resolves to the CloudFront distribution and serves the landing page over HTTPS
- [ ] HTTP requests to the domain redirect to HTTPS (no plain HTTP access)
- [ ] The ACM certificate is valid and covers the domain; the browser shows no certificate warnings
- [ ] The waitlist form on the live domain successfully writes to the production `WAITLIST` table
- [ ] DNS propagation is confirmed from at least two independent DNS checkers

**Demo**
Open `https://<domain>` in the browser — the landing page loads with a valid HTTPS certificate. Submit a test email and confirm the row appears in the production `WAITLIST` table.

---

## Epic 3 — Data-Access Layer

> **Goal.** Every DynamoDB access pattern (AP-1 through AP-34) is implemented as a typed, tested module that the API Lambdas and the import worker can call directly. No Lambda writes raw DynamoDB expressions — they call a named function.
> **Outcome.** A shared data-access package exists with: ElectroDB entity definitions for all 12 main-table item types; typed query functions for every access pattern; raw AWS SDK v3 modules for the price-cache and sessions tables; and deterministic key-generation helpers for two-layer deduplication. Any Lambda that imports this package gets end-to-end type safety from tRPC call to DynamoDB item.
> **Infrastructure note.** This epic provisions the main `BeyondFolio` DynamoDB table and its 3 GSIs in CDK — the first time that table exists.

---

### E3-T1 — Provision the main BeyondFolio table and 3 GSIs in CDK

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Type       | Enabler                                        |
| Priority   | P0                                             |
| Status     | To Do                                          |
| Depends on | E1-T2                                          |
| Implements | TRD §7.1 · data model §6, §8 · ADR-001–ADR-003 |

**Description**
Add the main `BeyondFolio` DynamoDB table to the CDK stack with its composite primary key (`PK` String, `SK` String), three GSIs, PITR enabled, and on-demand capacity. The three GSIs are:

- **GSI1** — trades by broker: `GSI1PK` / `GSI1SK`
- **GSI2** — journal entries by tag: `GSI2PK` / `GSI2SK`
- **GSI3** — trades by ticker: `GSI3PK` / `GSI3SK`

All GSI key attribute names and types must exactly match the data model (§8).

**Acceptance Criteria**

- [ ] The CDK stack defines the `BeyondFolio` table with `PK` (String) partition key and `SK` (String) sort key
- [ ] All three GSIs (GSI1, GSI2, GSI3) are defined with the correct key attribute names and types per data model §8
- [ ] PITR is enabled on the table; on-demand capacity is used
- [ ] `cdk synth` produces the table and all GSIs in the CloudFormation template with no errors
- [ ] The table and GSI names are read from config, not hardcoded
- [ ] The local bootstrap script (E1-T3) is updated to create this table and its GSIs in DynamoDB Local

**Demo**
Run `cdk deploy` (or the local bootstrap) and confirm the table exists with all three GSIs visible in the AWS Console or DynamoDB Local.

---

### E3-T2 — Define ElectroDB entities for all main-table item types

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| Type       | Enabler                                     |
| Priority   | P0                                          |
| Status     | To Do                                       |
| Depends on | E3-T1                                       |
| Implements | TRD §3.2 · data model §7 · ADR-003, ADR-004 |

**Description**
In the shared data-access package, define an ElectroDB entity for each of the 12 item types that live in the main table: `User`, `BrokerAccount`, `ImportedFile`, `Trade`, `Cashflow`, `JournalEntry`, `Tag`, `JournalEntryTagLink`, `TagScorecard`, `SymbolMapping`, `BrokerMapper`, and `AuthIdentity`. Each entity definition must encode the exact `PK`/`SK` key patterns, `entityType` attribute, GSI key attributes (where applicable), and all item attributes from data model §7. ElectroDB is a data-access convenience — the authoritative schema is the data model, not the ElectroDB definition.

**Acceptance Criteria**

- [ ] All 12 item types have a corresponding ElectroDB entity definition in the shared data-access package
- [ ] Each entity's `PK` and `SK` patterns exactly match data model §7 (e.g. Trade SK = `TRADE#<date>#<tradeId>`)
- [ ] Entities that populate GSIs (Trade for GSI1 and GSI3; JournalEntryTagLink for GSI2) include the correct GSI key attributes
- [ ] Each entity includes the `entityType` attribute with its correct string value (e.g. `"Trade"`, `"Cashflow"`)
- [ ] TypeScript types are inferred from the entity definitions — no manual type duplication
- [ ] A unit test for each entity verifies that ElectroDB constructs the correct `PK` and `SK` for a sample item

**Demo**
In a unit test, create a sample Trade item via the ElectroDB entity and assert the generated `PK`, `SK`, `GSI1PK`, `GSI1SK`, `GSI3PK`, `GSI3SK` values match the expected key patterns from data model §7.4.

---

### E3-T3a — Implement typed write functions for all write access patterns

| Field      | Value                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| Type       | Enabler                                                                 |
| Priority   | P0                                                                      |
| Status     | To Do                                                                   |
| Depends on | E3-T2                                                                   |
| Implements | TRD §3.2 · data model §12 · AP-2a, AP-4, AP-6, AP-8, AP-9, AP-27, AP-34 |

**Description**
Implement named, typed write functions for every write access pattern in the shared data-access package. Covers: provisioning a User + AuthIdentity on first sign-in (AP-2a), creating/updating a BrokerAccount (AP-4), recording an imported file idempotently (AP-6), recording a Trade idempotently (AP-8), recording a Cashflow idempotently (AP-9), upserting a SymbolMapping (AP-27), and creating/updating/deleting a BrokerMapper (AP-34). All write functions that require idempotency use `attribute_not_exists(PK)` conditional expressions — no read-then-write pattern. No Lambda constructs a raw `PutCommand` or `UpdateCommand` directly.

**Acceptance Criteria**

- [ ] All seven write APs (AP-2a, AP-4, AP-6, AP-8, AP-9, AP-27, AP-34) have a corresponding named, typed function
- [ ] AP-6, AP-8, and AP-9 use `attribute_not_exists(PK)` conditional writes — calling the same function twice with the same input is a safe no-op and does not throw
- [ ] AP-2a (first-login provisioning) writes both the `User` item and the `AuthIdentity` item idempotently in a single operation
- [ ] TypeScript compilation catches a caller passing the wrong type to any write function
- [ ] Integration tests against DynamoDB Local verify idempotency for AP-6, AP-8, and AP-9: calling each write function twice produces exactly one item in the table, not two

**Demo**
Call the AP-8 `putTrade` function twice with identical input against DynamoDB Local. Confirm exactly one Trade item exists in the table. Run the integration tests — all write-pattern tests pass.

---

### E3-T3b — Implement typed read and query functions for all read access patterns

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Type       | Enabler                                                                                   |
| Priority   | P0                                                                                        |
| Status     | To Do                                                                                     |
| Depends on | E3-T2, E3-T3a                                                                             |
| Implements | TRD §3.2 · data model §12 · AP-1, AP-3, AP-5, AP-7, AP-10–AP-14, AP-15–AP-26, AP-28–AP-33 |

**Description**
Implement named, typed read and query functions for every read access pattern in the shared data-access package. Covers: get user profile (AP-1), list broker accounts (AP-3), file-level dedup check (AP-5), trade-level dedup check (AP-7), all trade history queries (AP-10, AP-11 via GSI1, AP-12, AP-30 via GSI3), XIRR cashflow reads (AP-13, AP-14), all journal and tag queries (AP-15 through AP-26 including GSI2), price-cache reads (AP-28, AP-29, AP-31, AP-32), and BrokerMapper lookup (AP-33). All list functions return `{ items: T[], nextCursor?: string }` and accept an optional `cursor` parameter for cursor-based pagination (default page size 50). No Lambda constructs a raw `QueryCommand` or `GetCommand` directly.

**Acceptance Criteria**

- [ ] All read APs have a corresponding named, typed function
- [ ] All list functions return `{ items: T[], nextCursor?: string }` and accept an optional `cursor` parameter
- [ ] AP-11 (trades by broker) correctly queries GSI1 using `USER#<userId>#BROKER#<broker>` as the partition key
- [ ] AP-21 (journal entries by tag) correctly queries GSI2 using `USER#<userId>#TAG#<tagName>` as the partition key
- [ ] AP-30 (trades by ticker) correctly queries GSI3 using `USER#<userId>#SYM#<canonicalSymbol>` as the partition key
- [ ] A function that receives a non-existent key returns `null` (not throws) for single-item reads and an empty array for queries
- [ ] TypeScript compilation catches a caller passing the wrong type to any read function
- [ ] Integration tests against DynamoDB Local verify at least one happy-path and one empty-result case for each access pattern group: Users & Accounts, Trade History, XIRR, Journal & Tags, Evaluation, Prices, Admin

**Demo**
Seed DynamoDB Local with Trade items across two brokers and two tickers. Call `listTradesByBroker` (AP-11) and confirm only one broker's trades are returned. Call `listTradesByTicker` (AP-30) and confirm only that ticker's trades are returned. Run the full read integration test suite — all tests pass.

---

### E3-T4 — Implement deterministic key helpers for two-layer deduplication

| Field      | Value                                                |
| ---------- | ---------------------------------------------------- |
| Type       | Enabler                                              |
| Priority   | P0                                                   |
| Status     | To Do                                                |
| Depends on | E3-T2                                                |
| Implements | TRD §2.4 · FR-D1, FR-D2 · data model §10.1 · ADR-005 |

**Description**
Implement the deterministic key-generation functions that make two-layer deduplication work. Layer 1: a `hashFile(buffer)` function that computes the SHA-256 of a file's raw bytes and returns it as the `contentHash` used in the `FILE#<contentHash>` sort key. Layer 2: `generateTradeId(...)` and `generateCashflowId(...)` functions that derive a deterministic ID from each trade's/cashflow's natural identity fields (per-broker distinguishers: Zerodha `brokerTradeId`, Fidelity `cashBalance`, Robinhood `occurrence`). The same input must always produce the same output.

**Acceptance Criteria**

- [ ] `hashFile(buffer)` returns a consistent SHA-256 hex string for the same input; different inputs return different hashes
- [ ] `generateTradeId` and `generateCashflowId` are pure functions — given the same natural-identity inputs they always return the same ID
- [ ] Unit tests verify that the same trade row produces the same `tradeId` across two separate calls (idempotency)
- [ ] Unit tests verify that two trade rows that differ in any natural-identity field produce different IDs (collision resistance)
- [ ] The per-broker distinguisher logic is tested for all three brokers: Zerodha (`brokerTradeId`), Fidelity (`cashBalance`), Robinhood (`occurrence`)

**Demo**
Run the unit tests for the key helpers; all idempotency and collision-resistance cases pass.

---

### E3-T5 — Implement raw SDK modules for price-cache and sessions tables

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Type       | Enabler                                        |
| Priority   | P0                                             |
| Status     | To Do                                          |
| Depends on | E3-T1                                          |
| Implements | TRD §3.2, §5.4, §7.1 · data model §9 · ADR-003 |

**Description**
Implement thin AWS SDK v3 DocumentClient modules for the two tables that do not use ElectroDB: the price-cache table (for `PRICE#` current prices and `PRICEHIST#` historical series — AP-28, AP-29, AP-31, AP-32) and the sessions table (for refresh-token write, read, delete, and delete-all-for-user). Both tables use plain `GetItem`/`PutItem`/ `DeleteItem` calls — no single-table modeling library is needed. The sessions table is provisioned in CDK in E4-T1; this task only implements the access functions.

**Acceptance Criteria**

- [ ] A `priceCache` module exports: `getCurrentPrice(symbol, currency)`, `putCurrentPrice(symbol, currency, price, ttl)`, `getHistoricalSeries(symbol, currency)`, `putHistoricalSeries(symbol, currency, series, fetchedDate, ttl)`
- [ ] A `sessions` module exports: `createSession(userId, sessionId, refreshToken, expiresAt)`, `getSession(sessionId)`, `deleteSession(sessionId)`, `deleteAllSessionsForUser(userId)`
- [ ] All functions handle the case where an item does not exist (returns `null`, not throws)
- [ ] The TTL attribute (`expiresAt`) is written as an epoch-seconds number on every price-cache and session write
- [ ] Unit tests (with a mocked DynamoDB client) verify the correct `GetItem`/`PutItem`/`DeleteItem` parameters are passed for each function

**Demo**
Run the unit tests for both modules; all pass. Manually call `putCurrentPrice` and `getCurrentPrice` against DynamoDB Local and confirm the item is written and read back correctly.

---

## Epic 4 — Auth & Session

> **Goal.** A user can sign in with Google, receive a short-lived access token and a revocable refresh token, make authenticated API calls, and log out — with all token operations enforced server-side and no credentials ever exposed to the browser beyond what is necessary.
> **Outcome.** The `auth-api` Lambda is the sole issuer of tokens and the sole accessor of the sessions table. The tRPC middleware in all four API Lambdas verifies tokens and injects a trusted `userId` into every request context. A developer can sign in, make a protected tRPC call, and see it succeed; an unauthenticated call is rejected with `UNAUTHORIZED`.
> **Infrastructure note.** This epic provisions the sessions DynamoDB table, the Google OAuth client secret in SSM, and the asymmetric JWT key pair in SSM.

---

### E4-T1 — Provision the sessions table, OAuth secret, and JWT keys in CDK

| Field      | Value                                            |
| ---------- | ------------------------------------------------ |
| Type       | Enabler                                          |
| Priority   | P0                                               |
| Status     | To Do                                            |
| Depends on | E1-T2                                            |
| Implements | TRD §5.4, §7.1, §7.4 · data model §9.7 · ADR-003 |

**Description**
Add three infrastructure resources to the CDK stack: (1) a `Sessions` DynamoDB table with `sessionId` as the partition key, a GSI on `userId` (to support delete-all-sessions-for-user), TTL on `expiresAt`, on-demand capacity, and PITR off; (2) an SSM SecureString parameter for the Google OAuth client secret; (3) an SSM SecureString parameter for the JWT RS256 private signing key. The JWT public verification key is stored as a plain (non-secret) environment variable available to all API Lambdas. Only the `auth-api` Lambda IAM role is granted read access to the private key and OAuth secret parameters.

**Acceptance Criteria**

- [ ] The CDK stack defines a `Sessions` table with `sessionId` (String) partition key, a GSI on `userId`, TTL on `expiresAt`, on-demand capacity, and PITR disabled
- [ ] An SSM SecureString parameter exists for the Google OAuth client secret; only the `auth-api` Lambda IAM role can read it
- [ ] An SSM SecureString parameter exists for the JWT RS256 private signing key; only the `auth-api` Lambda IAM role can read it
- [ ] The JWT RS256 public verification key is set as a plain environment variable on `app-api`, `import-api`, and `admin-api` Lambdas
- [ ] `cdk synth` produces all three resources with the correct IAM bindings in the CloudFormation template
- [ ] The local bootstrap script is updated to create the Sessions table in DynamoDB Local and set placeholder SSM values for local dev

**Demo**
Run `cdk deploy` (or local bootstrap) and confirm the Sessions table, both SSM parameters, and the IAM policies exist as specified.

---

### E4-T2 — Implement the Google OIDC sign-in and callback flow

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Type       | Feature                               |
| Priority   | P0                                    |
| Status     | To Do                                 |
| Depends on | E4-T1, E3-T2                          |
| Implements | TRD §5.1–5.3 · FR-A1, FR-A2 · ADR-013 |

**Description**
Implement the Google OAuth 2.0 / OIDC authorization-code flow in the `auth-api` Lambda using `openid-client`. Two endpoints: `GET /auth/signin` redirects the browser to Google's OAuth consent page (with PKCE, `state`, and `nonce`); `GET /auth/callback` handles the return, verifies the Google ID token against Google's JWKS, reads the `sub`, and resolves or provisions the user.

**Acceptance Criteria**

- [ ] `GET /auth/signin` redirects to Google's OAuth URL with `client_id`, `redirect_uri`, `scope` (`openid email profile`), `state`, `nonce`, and PKCE `code_challenge` parameters present
- [ ] `GET /auth/callback` with a valid Google authorization code completes the token exchange and verifies the ID token signature against Google's JWKS
- [ ] On first sign-in, a `User` item (`PK = USER#<userId>`, `SK = PROFILE`) and an `AuthIdentity` item are written to the main DynamoDB table via `attribute_not_exists(PK)` conditional writes
- [ ] On a returning user's sign-in, the same `userId` is resolved from the `AuthIdentity` item; no duplicate `User` item is created
- [ ] A callback with a tampered `state`, invalid `nonce`, or invalid ID token returns an error response and writes nothing to DynamoDB
- [ ] No Google `sub`, raw ID token, or email address appears in CloudWatch logs

**Demo**
Complete the Google sign-in flow end-to-end against DynamoDB Local. Sign in once — confirm `User` and `AuthIdentity` items exist. Sign in again with the same Google account — confirm still only one `User` item exists.

---

### E4-T3 — Issue access token and refresh token after successful sign-in

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Type       | Enabler                               |
| Priority   | P0                                    |
| Status     | To Do                                 |
| Depends on | E4-T2, E3-T5                          |
| Implements | TRD §5.2–5.5 · FR-A3, FR-A4 · ADR-013 |

**Description**
After the Google callback confirms the user's identity, `auth-api` issues two tokens. A short-lived RS256 JWT **access token** signed with the private key from SSM (via `jose`), containing `userId` and `role` claims. A **refresh token** (a cryptographically random opaque string) written to the Sessions table with a `userId`, `sessionId`, `expiresAt` TTL, and the hashed token value. The access token is returned in the response body; the refresh token is set as an `HttpOnly` + `Secure` + `SameSite=Lax` cookie scoped to `/auth/refresh`.

**Acceptance Criteria**

- [ ] After a successful OAuth callback, the response body contains a signed JWT access token with `userId` and `role` claims
- [ ] The JWT signature can be verified using the RS256 public key
- [ ] The JWT has an `exp` claim set to approximately 15 minutes from issue time
- [ ] The response sets a cookie named `refreshToken` that is `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/auth/refresh`
- [ ] One Session item is written to the Sessions table with `userId`, `sessionId`, `expiresAt` (longer-lived, e.g. 30 days), and a hashed representation of the refresh token (the raw token value is not stored)
- [ ] No access token value, refresh token value, or JWT signing key appears in CloudWatch logs

**Demo**
Inspect the response from a successful OAuth callback: confirm the JWT is present in the body and the `refreshToken` cookie is set with the correct attributes. Confirm one Session item exists in DynamoDB Local with the correct `userId`.

---

### E4-T4 — Implement the token refresh endpoint

| Field      | Value                      |
| ---------- | -------------------------- |
| Type       | Feature                    |
| Priority   | P0                         |
| Status     | To Do                      |
| Depends on | E4-T3                      |
| Implements | TRD §5.3 · FR-A3 · ADR-013 |

**Description**
Implement `POST /auth/refresh` in `auth-api`. The endpoint reads the `refreshToken` cookie, looks up the session in the Sessions table, validates it (exists, not expired, hash matches), issues a new access token, and rotates the refresh token (old session deleted, new session written). If the session is invalid or expired, return 401 and clear the cookie.

**Acceptance Criteria**

- [ ] `POST /auth/refresh` with a valid `refreshToken` cookie returns a new JWT access token in the response body
- [ ] The old Session item is deleted and a new one is written (token rotation) on every successful refresh
- [ ] `POST /auth/refresh` with an invalid, expired, or missing cookie returns HTTP 401 and sets a `Set-Cookie` header that clears the `refreshToken` cookie
- [ ] `POST /auth/refresh` with a refresh token that has been revoked (session deleted) returns HTTP 401
- [ ] A refresh call that is rejected does not issue a new access token and does not create a new Session item

**Demo**
Call `POST /auth/refresh` with a valid cookie — receive a new access token. Delete the Session item from DynamoDB Local manually (simulating logout), then call refresh again — receive 401.

---

### E4-T5 — Implement logout and log-out-everywhere

| Field      | Value                      |
| ---------- | -------------------------- |
| Type       | Feature                    |
| Priority   | P0                         |
| Status     | To Do                      |
| Depends on | E4-T3                      |
| Implements | TRD §5.3 · FR-A3 · ADR-013 |

**Description**
Implement two logout endpoints in `auth-api`. `POST /auth/logout` deletes the current session (identified by the `refreshToken` cookie) and clears the cookie. `POST /auth/logout/all` deletes all Session items for the authenticated user (using the GSI on `userId`), ending every active session on every device.

**Acceptance Criteria**

- [ ] `POST /auth/logout` deletes the Session item matching the current `refreshToken` cookie and returns HTTP 200
- [ ] After `POST /auth/logout`, the `refreshToken` cookie is cleared (expired `Set-Cookie` header) in the response
- [ ] After `POST /auth/logout`, calling `POST /auth/refresh` with the old cookie returns HTTP 401
- [ ] `POST /auth/logout/all` deletes all Session items for the user; calling refresh with any previously-issued refresh token for that user returns HTTP 401
- [ ] Both endpoints require a valid access token (`Authorization: Bearer`) to identify the user; an unauthenticated call returns HTTP 401

**Demo**
Sign in to create a session. Call `POST /auth/logout`. Confirm the Session item is gone from DynamoDB Local and refresh returns 401. Sign in twice (two sessions). Call `POST /auth/logout/all`. Confirm both Session items are gone.

---

### E4-T6 — Implement tRPC auth middleware and three procedure types

| Field      | Value                               |
| ---------- | ----------------------------------- |
| Type       | Enabler                             |
| Priority   | P0                                  |
| Status     | To Do                               |
| Depends on | E4-T3                               |
| Implements | TRD §5.7 · FR-P1 · ADR-002, ADR-013 |

**Description**
Implement the tRPC middleware that enforces authentication across all four API Lambdas. The middleware reads the `Authorization: Bearer` header, verifies the JWT signature using the RS256 public key (via `jose` — no DynamoDB lookup), and injects the verified `userId` and `role` into the tRPC context. Implement three procedure types: `publicProcedure` (no auth required), `protectedProcedure` (valid token required), and `adminProcedure` (valid token + `role === "admin"` required). The `userId` in context must always come from the verified token — never from a request body or query parameter.

**Acceptance Criteria**

- [ ] A `protectedProcedure` call with a valid JWT succeeds and the handler receives the correct `userId` and `role` from context
- [ ] A `protectedProcedure` call with no `Authorization` header returns a tRPC `UNAUTHORIZED` error
- [ ] A `protectedProcedure` call with an expired or tampered JWT returns a tRPC `UNAUTHORIZED` error
- [ ] An `adminProcedure` call with a valid JWT where `role !== "admin"` returns a tRPC `FORBIDDEN` error
- [ ] The `userId` in the tRPC context is extracted from the verified token payload — passing a different `userId` in the request body has no effect on which data is accessed
- [ ] The middleware runs in all four API Lambdas using shared code — it is not duplicated per Lambda

**Demo**
Call a `protectedProcedure` with a valid JWT — it succeeds. Call the same procedure with no token, an expired token, and a tampered token — all return `UNAUTHORIZED`. Call an `adminProcedure` with a non-admin token — returns `FORBIDDEN`.

---

### E4-T7 — Implement silent token refresh in the Next.js frontend

| Field      | Value            |
| ---------- | ---------------- |
| Type       | Feature          |
| Priority   | P0               |
| Status     | To Do            |
| Depends on | E4-T4, E4-T6     |
| Implements | TRD §5.5 · FR-A3 |

**Description**
In the Next.js frontend, implement the client-side auth state manager. The access token is held in memory (never in `localStorage` or a readable cookie). On app load and on every 401 response from the API, the client automatically calls `POST /auth/refresh` to obtain a new access token using the `HttpOnly` refresh cookie. If the refresh also fails (cookie expired or revoked), the user is redirected to the sign-in page. Authenticated pages are protected — an unauthenticated visitor is redirected to sign-in.

**Acceptance Criteria**

- [ ] On app load, if a valid `refreshToken` cookie exists, a new access token is obtained silently without the user seeing a login page
- [ ] If the refresh fails on app load (no cookie, expired, revoked), the user is redirected to the sign-in page
- [ ] When an API call returns 401 (expired access token), the client automatically refreshes the token and retries the original request once — the user sees no interruption
- [ ] The access token is never written to `localStorage`, `sessionStorage`, or a readable cookie — it exists only in memory
- [ ] Authenticated route pages redirect to sign-in if no valid session can be established
- [ ] Calling `POST /auth/logout` clears the in-memory token and redirects the user to the sign-in page

**Demo**
Sign in, wait for the access token to expire (~15 min, or shorten expiry for testing), then make an API call — confirm it succeeds transparently via the silent refresh. Sign out — confirm the user lands on the sign-in page and a subsequent refresh attempt fails.

---

## Epic 5 — Shared Backend Platform

> **Goal.** All four API Lambdas (`app-api`, `import-api`, `admin-api`, `auth-api`) are wired to API Gateway, running tRPC servers with consistent Zod input validation, typed error codes, structured JSON logging with a correlation ID, and a shared `getSecret()` helper for SSM access. This is the platform layer every feature epic builds on.
> **Outcome.** A developer can add a new tRPC procedure to any Lambda, deploy it, and it is immediately reachable from the frontend with full type safety, validated inputs, consistent error shapes, and correlated logs. No feature epic needs to set up its own server, error handling, or logging.
> **Infrastructure note.** This epic provisions API Gateway and wires the four Lambda IAM execution roles with their minimum permissions.

---

### E5-T1 — Provision API Gateway and wire the four API Lambdas in CDK

| Field      | Value                |
| ---------- | -------------------- |
| Type       | Enabler              |
| Priority   | P0                   |
| Status     | To Do                |
| Depends on | E1-T2, E4-T1         |
| Implements | TRD §4.2, §7.4, §8.1 |

**Description**
Add an API Gateway HTTP API to the CDK stack and create the four Lambda functions (`app-api`, `import-api`, `admin-api`, `auth-api`). Wire each Lambda to a route prefix on the gateway (`/app/*`, `/import/*`, `/admin/*`, `/auth/*`). Configure least-privilege IAM execution roles: `auth-api` gets read access to the sessions table and the SSM secrets for the OAuth client secret and JWT private key; the other three Lambdas get the JWT public key as an environment variable only; no Lambda has permissions it doesn't need.

**Acceptance Criteria**

- [ ] The CDK stack defines an API Gateway HTTP API with four Lambda integrations, one per route prefix
- [ ] Each Lambda has its own IAM execution role; no role grants access to a resource the Lambda does not use
- [ ] `auth-api`'s IAM role includes read access to the sessions table and both SSM SecureString parameters; no other Lambda's role does
- [ ] All four Lambdas receive the JWT public verification key as a plain environment variable
- [ ] `cdk synth` produces all four Lambdas and the API Gateway with no errors
- [ ] A `GET /auth/health` public endpoint returns HTTP 200 after deploy, confirming the gateway-to-Lambda wiring is working

**Demo**
Deploy the CDK stack and `curl GET /auth/health` — receive HTTP 200. Confirm in the AWS Console (or local equivalent) that the four Lambdas exist and each has a distinct IAM role.

---

### E5-T2 — Set up tRPC servers with Zod validation and typed error codes

| Field      | Value                  |
| ---------- | ---------------------- |
| Type       | Enabler                |
| Priority   | P0                     |
| Status     | To Do                  |
| Depends on | E5-T1, E4-T6           |
| Implements | TRD §4.1, §4.4 · FR-P1 |

**Description**
Initialise a tRPC server in each of the four API Lambdas using a shared tRPC initialiser that wires in the auth middleware from E4-T6. Each server uses the three procedure types (`publicProcedure`, `protectedProcedure`, `adminProcedure`). Every procedure input is validated with a Zod schema declared alongside the procedure — tRPC rejects malformed input before the handler runs. Define the project's standard typed error codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `INTERNAL_SERVER_ERROR`) as a shared enum so every Lambda uses the same codes and the frontend can handle them uniformly.

**Acceptance Criteria**

- [ ] Each of the four Lambdas runs a tRPC server initialised with the shared auth middleware
- [ ] A `protectedProcedure` that declares a Zod input schema rejects a request with a missing required field with a `BAD_REQUEST` tRPC error before the handler body executes
- [ ] A `protectedProcedure` called without a valid Bearer token returns a `UNAUTHORIZED` tRPC error (verified from E4-T6)
- [ ] An `adminProcedure` called with a non-admin token returns `FORBIDDEN`
- [ ] Internal unhandled errors return `INTERNAL_SERVER_ERROR` with a safe user-facing message — no stack trace or internal detail is exposed in the error response
- [ ] The tRPC router types are exported so the Next.js frontend can import them for end-to-end type safety

**Demo**
Add a stub `protectedProcedure` with a Zod-validated input to `app-api`. Call it with a valid token and correct input — it succeeds. Call it with a missing field — receive `BAD_REQUEST`. Call it with no token — receive `UNAUTHORIZED`.

---

### E5-T3 — Implement structured JSON logging with correlation ID

| Field      | Value          |
| ---------- | -------------- |
| Type       | Enabler        |
| Priority   | P0             |
| Status     | To Do          |
| Depends on | E5-T1          |
| Implements | TRD §9.2, §9.3 |

**Description**
Implement a shared logging module that all Lambdas (including the import worker) use for every log statement. Logs are emitted as structured JSON to stdout (CloudWatch captures this automatically). Every log entry includes a `correlationId` that is generated at the API Lambda entry point and propagated to the SQS message so the import worker's logs carry the same ID as the originating request. Implement the never-log policy: the logger must not accept raw objects that could contain PII — only named safe fields (e.g. `userId`, `importId`, `broker`, `rowCount`, `errorCode`, `durationMs`).

**Acceptance Criteria**

- [ ] All Lambda log statements produce valid JSON objects in CloudWatch
- [ ] Every log entry includes `correlationId`, `level`, `message`, and `timestamp` at minimum
- [ ] The `correlationId` is generated at the API request entry point (e.g. from the `x-correlation-id` header, or generated if absent) and included in every log entry for that request
- [ ] The SQS message payload includes the `correlationId` so the import worker's logs carry the same ID as the request that triggered the job
- [ ] The logger module does not accept a raw request object, file buffer, or user object as a loggable value — only explicitly named fields
- [ ] A unit test confirms that calling the logger with a disallowed field type (e.g. a raw object with an `email` field) either strips the field or throws a compile-time error

**Demo**
Trigger a request that flows through an API Lambda to the import worker. Open CloudWatch Logs and confirm all log entries from both the Lambda and the worker share the same `correlationId`.

---

### E5-T4 — Implement the getSecret() helper for SSM access

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E5-T1    |
| Implements | TRD §7.4 |

**Description**
Implement a shared `getSecret(parameterName)` helper that reads an SSM SecureString parameter and caches the value in Lambda memory for the lifetime of the function instance (to avoid repeated SSM calls on every invocation). All secret reads across all Lambdas go through this one helper — no Lambda calls SSM directly. The helper is the single seam for a future migration to AWS Secrets Manager if needed.

**Acceptance Criteria**

- [ ] `getSecret(parameterName)` returns the decrypted SSM SecureString value for a given parameter name
- [ ] The value is cached in memory after the first call; a second call with the same parameter name in the same Lambda instance does not make a second SSM API call
- [ ] If the SSM parameter does not exist or the Lambda's IAM role lacks permission to read it, `getSecret` throws a descriptive error (not a silent `undefined`)
- [ ] No secret value returned by `getSecret` is passed to the logger or appears in any log output
- [ ] A unit test (with a mocked SSM client) verifies the caching behaviour: SSM is called once even when `getSecret` is called three times with the same parameter name in sequence

**Demo**
Run the unit test for `getSecret`; the mock SSM client is called exactly once across three sequential calls for the same parameter.

---

### E5-T5 — Export the tRPC client type for the Next.js frontend

| Field      | Value          |
| ---------- | -------------- |
| Type       | Enabler        |
| Priority   | P0             |
| Status     | To Do          |
| Depends on | E5-T2          |
| Implements | TRD §4.1, §3.3 |

**Description**
Export the combined tRPC `AppRouter` type from the backend so the Next.js frontend can create a fully typed tRPC client. The client automatically attaches the `Authorization: Bearer` access token header to every request. Wire the tRPC client into a shared frontend module so all pages import it from one place. This is the plumbing that gives the frontend compile-time type safety for every API call.

**Acceptance Criteria**

- [ ] The backend exports a single `AppRouter` type that combines the routers from all four API Lambdas
- [ ] The Next.js frontend has a tRPC client module that imports `AppRouter` and is configured with the API Gateway base URL
- [ ] The client module automatically adds the `Authorization: Bearer <accessToken>` header to every request using the in-memory token from E4-T7
- [ ] TypeScript compilation in the frontend fails if a procedure name or input type changes in the backend and the frontend is not updated — the type safety is end-to-end
- [ ] A stub procedure call from the frontend to a backend stub compiles and succeeds at runtime against the local stack

**Demo**
Add a stub `protectedProcedure` to `app-api`. Call it from a Next.js page using the tRPC client with a valid session. Confirm the call succeeds. Rename the procedure in the backend — confirm the frontend immediately shows a TypeScript compile error.

---

## Epic 6 — Import: Upload & Detection

> **Goal.** A user can upload a broker file, have it validated and detected as a known broker format, and start the import process with a single click. Duplicate files are caught immediately. Unrecognised files are rejected with a clear message. The import job's status is trackable from the moment the file is uploaded.
> **Outcome.** After this epic, the upload-through-Gate-1 portion of the two-gate import flow works end-to-end: a user uploads a file, sees it detected as e.g. "Robinhood", clicks "Proceed to Import", and the job is queued for async processing. The import worker (E7) is not built yet, so the job sits in the queue — but the status spine, the pre-signed URL, the detection logic, and Gate 1 are all in place and testable.
> **Infrastructure note.** This epic provisions the S3 bucket (with `temp/` lifecycle rule) and the SQS queue + DLQ in CDK.

---

### E6-T1 — Provision the S3 bucket and SQS queue + DLQ in CDK

| Field      | Value                    |
| ---------- | ------------------------ |
| Type       | Enabler                  |
| Priority   | P0                       |
| Status     | To Do                    |
| Depends on | E1-T2                    |
| Implements | TRD §7.2, §7.3 · ADR-016 |

**Description**
Add two infrastructure resources to the CDK stack. First, an S3 bucket with SSE-S3 encryption, Block Public Access enabled, a TLS-only bucket policy, versioning off, and a lifecycle rule that expires objects under the `temp/` prefix after 7 days. The lifecycle rule must be scoped strictly to the `temp/` prefix — permanent `<userId>/<contentHash>` keys must never be touched by it. Second, an SQS standard queue for import jobs with a dead-letter queue (DLQ) and a `maxReceiveCount` of 3. The import worker Lambda (added in E7) will be the consumer.

**Acceptance Criteria**

- [ ] The CDK stack defines an S3 bucket with SSE-S3, Block Public Access, TLS-only policy, and versioning disabled
- [ ] A lifecycle rule on the bucket expires objects with the `temp/` prefix after 7 days; objects without the `temp/` prefix are not affected by any lifecycle rule
- [ ] The CDK stack defines an SQS standard queue and a DLQ; the main queue's redrive policy points to the DLQ with `maxReceiveCount: 3`
- [ ] The `import-api` Lambda IAM role is granted `s3:PutObject` on `temp/*` and `sqs:SendMessage` on the import queue only
- [ ] `cdk synth` produces both resources with the correct configurations
- [ ] The local bootstrap script creates an equivalent S3 bucket in LocalStack with the same prefix structure

**Demo**
After `cdk deploy`, confirm the S3 bucket exists with the lifecycle rule visible in the AWS Console and the SQS queue + DLQ exist with the correct redrive policy.

---

### E6-T2 — Implement the pre-signed S3 upload URL endpoint

| Field      | Value                    |
| ---------- | ------------------------ |
| Type       | Feature                  |
| Priority   | P0                       |
| Status     | To Do                    |
| Depends on | E6-T1, E5-T2             |
| Implements | TRD §9.5, §2.3 · ADR-016 |

**Description**
Implement `POST /import/upload-url` in `import-api` as a `protectedProcedure`. The endpoint generates a pre-signed S3 `PUT` URL for the requesting user's `temp/` prefix, with a 5 MB maximum object size enforced by the pre-signed URL conditions and a short expiry (e.g. 5 minutes). The key is `temp/<userId>/<uploadId>` where `uploadId` is a server-generated UUID. The endpoint returns the pre-signed URL and the `uploadId`. The browser uploads the file directly to S3 using this URL — the file bytes never pass through the Lambda.

**Acceptance Criteria**

- [ ] `POST /import/upload-url` (authenticated) returns a pre-signed S3 `PUT` URL and an `uploadId`
- [ ] The pre-signed URL is scoped to `temp/<userId>/<uploadId>` — it cannot be used to write to any other S3 key
- [ ] The pre-signed URL enforces a 5 MB maximum content length via S3 conditions; a `PUT` with a body exceeding 5 MB is rejected by S3 with a 403 or 400
- [ ] The pre-signed URL expires after no more than 5 minutes; using it after expiry is rejected by S3
- [ ] An unauthenticated call to `POST /import/upload-url` returns `UNAUTHORIZED`
- [ ] The `uploadId` in the returned URL key is a server-generated UUID — the client cannot supply its own key

**Demo**
Call `POST /import/upload-url` with a valid token. Use the returned URL to `PUT` a small CSV file directly to S3 (via `curl` or the browser). Confirm the file appears at `temp/<userId>/<uploadId>` in the S3 bucket (LocalStack). Attempt a PUT exceeding 5 MB — confirm S3 rejects it.

---

### E6-T3 — Implement Layer-1 file-hash deduplication and ImportedFile creation

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Type       | Feature                                           |
| Priority   | P0                                                |
| Status     | To Do                                             |
| Depends on | E6-T2, E3-T3a, E3-T4                              |
| Implements | TRD §2.3 · AP-5, AP-6 · ADR-005 · data model §7.3 |

**Description**
Implement `POST /import/register` in `import-api` as a `protectedProcedure`. After the browser uploads a file to S3 (via the pre-signed URL from E6-T2), the frontend calls this endpoint with the `uploadId`. The Lambda reads the file from S3, computes its SHA-256 hash, and attempts to write an `ImportedFile` item (`PK = USER#<userId>`, `SK = FILE#<contentHash>`, `status = UPLOADED`) using `attribute_not_exists(PK)`. If the write succeeds, the import is new. If it fails (condition check), the exact same file was already imported — return a clear message and the `importId` of the original import. On success, return the new `importId` and `contentHash`.

**Acceptance Criteria**

- [ ] `POST /import/register` with an `uploadId` pointing to a new file creates an `ImportedFile` item in DynamoDB with `status = UPLOADED` and returns the `importId` and `contentHash`
- [ ] Calling `POST /import/register` with a different `uploadId` but an identical file (same bytes, same SHA-256) returns a `CONFLICT` response with the message "this file has already been imported" and the original `importId` — no second `ImportedFile` item is created
- [ ] The `ImportedFile` item is created with `attribute_not_exists(PK)` — the conditional write is the dedup gate, not an application-layer read-then-write
- [ ] If the `uploadId` does not correspond to an existing S3 object (e.g. expired or wrong key), the endpoint returns `NOT_FOUND`
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Upload the same CSV file twice via two separate pre-signed URLs. Call `POST /import/register` for each. The first call returns a new `importId`. The second call returns `CONFLICT` with the first `importId`. Confirm only one `ImportedFile` item exists in DynamoDB Local.

---

### E6-T4 — Implement broker detection by header fingerprint

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Type       | Feature                                       |
| Priority   | P0                                            |
| Status     | To Do                                         |
| Depends on | E6-T3, E3-T3b                                 |
| Implements | TRD §2.3 · AP-33 · ADR-015 · data model §10.8 |

**Description**
After the `ImportedFile` item is created, the `import-api` Lambda reads the file header (first row) from S3 and matches it against the `headerFingerprint` values stored in the BrokerMapper items (`GLOBAL#BROKERMAPPER` / `MAPPER#<fileType>`). The fingerprint is the ordered, normalised (lowercased, trimmed) column headers joined as a string. If a mapper matches: return the detected broker name and file type to the frontend and update `ImportedFile` with `mapperId`. If no mapper matches: return a hard-stop error ("this file format is not recognised — contact support") and set `ImportedFile.status = FAILED`. Special case: if the Fidelity file contains `Account` or `Account Number` columns, it is a multi-account combined file — return a specific message asking the user to upload an individual-account file instead.

**Acceptance Criteria**

- [ ] A Robinhood activities CSV is detected as `ROBINHOOD_ACTIVITIES` and the correct broker name is returned to the frontend
- [ ] A Fidelity single-account CSV is detected as `FIDELITY_SINGLE_ACC_ACTIVITY`
- [ ] A Zerodha equity file is detected as `ZERODHA_EQUITY`
- [ ] A Zerodha F&O file is detected as `ZERODHA_FO`
- [ ] An unrecognised file (no mapper matches) returns a hard-stop error with the message "this file format is not recognised — contact support" and the `ImportedFile` status is set to `FAILED`
- [ ] A Fidelity combined multi-account file (detected by the presence of `Account` or `Account Number` columns) returns a specific message asking the user to upload an individual-account Fidelity file; the status is set to `FAILED`
- [ ] The detection logic reads the BrokerMapper items from DynamoDB — it does not hardcode any fingerprints

**Demo**
Call the detection step for each of the four supported file types and confirm the correct broker and file type is returned for each. Submit an unrecognised CSV — confirm the hard-stop error. Submit a simulated Fidelity multi-account file — confirm the specific multi-account rejection message.

---

### E6-T5 — Implement the import status polling endpoint

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Type       | Feature                                 |
| Priority   | P0                                      |
| Status     | To Do                                   |
| Depends on | E6-T3                                   |
| Implements | TRD §4.4, §2.5 · AP-5 · data model §7.3 |

**Description**
Implement `GET /import/:importId/status` in `import-api` as a `protectedProcedure`. Returns the current `ImportedFile` status and relevant metadata. This is the endpoint the frontend polls while background processing runs (after Gate 1) and while the commit runs (after Gate 2). The status values are: `UPLOADED`, `PROCESSING`, `PREVIEW_READY`, `COMMITTING`, `COMPLETE`, `FAILED`, `CANCELLED`. The endpoint must only return the status of an import that belongs to the requesting user — querying another user's import returns `NOT_FOUND`.

**Acceptance Criteria**

- [ ] `GET /import/:importId/status` returns the current `status`, `importId`, `broker`, `fileType`, and `detectedAt` for the requesting user's import
- [ ] All seven status values (`UPLOADED`, `PROCESSING`, `PREVIEW_READY`, `COMMITTING`, `COMPLETE`, `FAILED`, `CANCELLED`) are returned correctly as the `ImportedFile` item is updated through the pipeline
- [ ] Requesting the status of an import belonging to a different user returns `NOT_FOUND` (not `FORBIDDEN`) — no information is leaked about whether the import exists
- [ ] Requesting the status of a non-existent `importId` returns `NOT_FOUND`
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Create an `ImportedFile` item manually in DynamoDB Local with each of the seven status values in turn. Call `GET /import/:importId/status` for each and confirm the correct status is returned. Call the endpoint with a different user's token — confirm `NOT_FOUND`.

---

### E6-T6 — Implement Gate 1: the proceed-to-import endpoint

| Field      | Value                               |
| ---------- | ----------------------------------- |
| Type       | Feature                             |
| Priority   | P0                                  |
| Status     | To Do                               |
| Depends on | E6-T4, E6-T5, E6-T1                 |
| Implements | TRD §2.3 · FR-I4 · data model §10.8 |

**Description**
Implement `POST /import/:importId/proceed` in `import-api` as a `protectedProcedure`. This is Gate 1 — the user clicks "Proceed to Import" after seeing the detection confirmation. The endpoint validates that the import is in `UPLOADED` status and belongs to the requesting user, updates the `ImportedFile` status to `PROCESSING`, and enqueues a process job on the SQS import queue (message contains `importId`, `userId`, `s3TempKey`, `mapperId`, and `correlationId`). Returns immediately with the `importId` and `status: PROCESSING` — the heavy work runs asynchronously in the worker (E7).

**Acceptance Criteria**

- [ ] `POST /import/:importId/proceed` updates `ImportedFile.status` from `UPLOADED` to `PROCESSING` and returns `{ importId, status: "PROCESSING" }`
- [ ] A message is enqueued on the SQS import queue containing `importId`, `userId`, `s3TempKey`, `mapperId`, and `correlationId`
- [ ] Calling `proceed` on an import that is not in `UPLOADED` status (e.g. already `PROCESSING` or `COMPLETE`) returns `BAD_REQUEST`
- [ ] Calling `proceed` on another user's import returns `NOT_FOUND`
- [ ] An unauthenticated call returns `UNAUTHORIZED`
- [ ] After calling `proceed`, `GET /import/:importId/status` returns `PROCESSING`

**Demo**
Complete a full upload-and-detect flow (E6-T2 through E6-T4). Call `POST /import/:importId/proceed`. Confirm the status changes to `PROCESSING` and the SQS queue (LocalStack) contains one message with the correct payload. (The worker is not built yet — the message just sits in the queue.)

---

## Epic 7 — Import: Worker & Parsers

> **Goal.** The async import worker processes a queued job end-to-end: it reads the raw file from S3, parses and normalises it using the correct broker parser, applies Layer-2 deduplication, parks the normalised batch, and marks the import `PREVIEW_READY`. After the user confirms (Gate 2), the worker writes all trades and cashflows to DynamoDB and marks the import `COMPLETE`.
> **Outcome.** The full two-gate import flow works for all four broker file types. A user uploads a Robinhood, Fidelity, Zerodha EQ, or Zerodha F&O file, proceeds through both gates, and sees their trades in DynamoDB. The deduplication is idempotent — re-importing the same file or overlapping files adds zero duplicate records.
> **Infrastructure note.** This epic adds the `import-worker` Lambda to the CDK stack and wires it as the SQS consumer for the import queue provisioned in E6-T1.

---

### E7-T1 — Provision the import-worker Lambda and wire it to SQS in CDK

| Field      | Value                |
| ---------- | -------------------- |
| Type       | Enabler              |
| Priority   | P0                   |
| Status     | To Do                |
| Depends on | E6-T1, E1-T2         |
| Implements | TRD §2.2, §4.2, §8.1 |

**Description**
Add the `import-worker` Lambda to the CDK stack and configure it as the SQS event source for the import queue from E6-T1. The worker's IAM role needs: read/write access to the S3 bucket (`temp/*` read, `temp/*` and permanent prefix write), read/write access to the main DynamoDB table, and `sqs:ReceiveMessage` / `sqs:DeleteMessage` on the import queue. It does not have access to the sessions table, SSM secrets, or any other resource. Configure a batch size of 1 (one import job per invocation) and a visibility timeout longer than the maximum expected processing time.

**Acceptance Criteria**

- [ ] The CDK stack defines the `import-worker` Lambda with an SQS event source mapping pointing to the import queue from E6-T1
- [ ] The worker's IAM role grants S3 read on `temp/*`, S3 write on both `temp/*` and `<userId>/*`, and DynamoDB read/write on the main table only
- [ ] The worker's IAM role does not include access to the sessions table, any SSM parameter, the price-cache table, or the `admin-api` resources
- [ ] Batch size is set to 1; the visibility timeout is set to at least 5 minutes
- [ ] `cdk synth` produces the worker Lambda and SQS event source mapping with no errors
- [ ] A stub worker handler that logs the message and returns success processes a test message from the queue without error

**Demo**
Put a test message on the SQS queue (LocalStack). Confirm the stub worker Lambda is invoked and the message is consumed (deleted from the queue). Confirm the DLQ receives a message when the stub handler deliberately throws an error.

---

### E7-T2 — Implement the invocation-agnostic import pipeline core

| Field      | Value                             |
| ---------- | --------------------------------- |
| Type       | Enabler                           |
| Priority   | P0                                |
| Status     | To Do                             |
| Depends on | E7-T1, E3-T3a, E3-T4              |
| Implements | TRD §2.5, §2.4 · data model §10.8 |

**Description**
Implement the import pipeline as a standalone, invocation-agnostic function: `runImportJob(input) → result`. It takes a plain input object (importId, userId, s3TempKey, mapperId) and does all the work — it does not reach into the SQS event or the HTTP request object. The SQS worker handler is a thin wrapper that extracts the input from the message, calls `runImportJob`, and updates the `ImportedFile` status. This separation means the pipeline can be called from a test, a CLI script, or a different trigger without changing the core logic. Implement the status update helpers: `setStatus(importId, status)` transitions the `ImportedFile` through its spine (`PROCESSING → PREVIEW_READY`, `COMMITTING → COMPLETE`, `* → FAILED`).

**Acceptance Criteria**

- [ ] `runImportJob` is a plain function that accepts a typed input object and returns a typed result — it has no dependency on the SQS event shape
- [ ] The SQS handler extracts the input, calls `runImportJob`, and on success/failure updates the `ImportedFile` status accordingly
- [ ] If `runImportJob` throws an unhandled error, the SQS handler sets `ImportedFile.status = FAILED` and re-throws (so SQS retries up to `maxReceiveCount`, then routes to DLQ)
- [ ] `setStatus` is the only code that writes `ImportedFile.status` — no other module updates it directly
- [ ] A unit test calls `runImportJob` directly (no SQS event) with a mock input and confirms the pipeline executes and returns a result

**Demo**
Call `runImportJob` directly in a unit test with a mock input. Confirm it executes without needing an SQS event object. Deliberately throw inside the pipeline and confirm the SQS handler sets the status to `FAILED`.

---

### E7-T2b — Apply canonical symbol resolution during normalisation

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| Type       | Feature                                     |
| Priority   | P0                                          |
| Status     | To Do                                       |
| Depends on | E7-T2, E3-T3b                               |
| Implements | TRD §6.5 · FR-C1 · AP-26 · ADR-010, ADR-012 |

**Description**
Implement the symbol-resolution step that every parser calls before a Trade or Cashflow is finalised. Given a `(broker, rawSymbol)` pair, look up the global `SymbolMapping` table (AP-26) and, if a mapping exists, resolve the raw broker symbol to its current **canonical symbol** (e.g. `FB` → `META`) so that a ticker that changed via a corporate action is recognised as its current equivalent and history stays consistent (FR-C1). If no mapping exists, the raw symbol is treated as already canonical. The resolved `canonicalSymbol` is what populates the Trade's GSI3 ticker key and what the chart/valuation later query on — so old and new symbols for the same security collapse to one ticker in history and XIRR. This is the read/apply side of symbol resolution; the admin write side (creating/correcting mappings) is E13-T1 (AP-27).

**Acceptance Criteria**

- [ ] During normalisation, a raw symbol with a `SymbolMapping` entry is stored on the Trade as its `canonicalSymbol`; the original raw symbol is preserved (e.g. in `rawSymbol`/`rawAction`) for audit
- [ ] A raw symbol with no mapping is stored as-is (treated as already canonical) — resolution is a no-op, not an error
- [ ] Two trades imported under a pre/post-rename symbol pair (e.g. `FB` and `META`, with a mapping `FB → META`) both resolve to `META` and therefore appear under one ticker in `trades.listByTicker`
- [ ] Symbol resolution is applied consistently for all four broker parsers (it lives in the shared pipeline core, not per-parser)
- [ ] The lookup is a direct key read of the `GLOBAL#SYMBOLMAP` partition (AP-26) — no scan
- [ ] A unit test verifies both the mapped case (`FB → META`) and the unmapped pass-through case

**Demo**
Seed a `SymbolMapping` of `FB → META`. Import one fixture row with `FB` and one with `META`. Confirm both Trades are stored with `canonicalSymbol = META` and that `trades.listByTicker("META")` returns both.

---

### E7-T3 — Implement the Robinhood CSV parser

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Type       | Feature                                           |
| Priority   | P0                                                |
| Status     | To Do                                             |
| Depends on | E7-T2, E3-T4                                      |
| Implements | TRD §2.3 · data model §10.9, §7.4, §7.5 · ADR-015 |

**Description**
Implement the Robinhood parser for the `ROBINHOOD_ACTIVITIES` file type. The parser reads a CSV file, applies the BrokerMapper `columnMapping` (direct/lookup/classify/extract kinds), and produces an array of normalised `Trade` and/or `Cashflow` objects per the D1–D14 decisions. Key rules for Robinhood: `trans_code` column drives `cashflowType` classification; option symbols are parsed from the `description` column (extract kind); `occurrence` is the per-broker dedup distinguisher for Robinhood; all fees/commissions are captured as separate FEE cashflow rows; `rawAction` is preserved on every item; safe-fail on unrecognised `trans_code` (store row as-is with `includeInXIRR = false`).

**Acceptance Criteria**

- [ ] A Robinhood CSV fixture file runs through the parser and produces the expected array of normalised Trade and Cashflow objects
- [ ] A BUY row produces one `Trade` (type `BUY`) and one `Cashflow` (type `BUY`, negative amount, `includeInXIRR = true`)
- [ ] A SELL row produces one `Trade` (type `SELL`) and one `Cashflow` (type `SELL`, positive amount, `includeInXIRR = true`)
- [ ] A dividend row produces one `Cashflow` (type `DIVIDEND`, positive, `includeInXIRR = true`) and no Trade
- [ ] A Gold subscription or regulatory fee row produces one `Cashflow` (type `FEE`, negative, `includeInXIRR = true`) and no Trade
- [ ] An option row has `optionDetails` (strike, expiry, call/put) parsed from the description column; `instrumentType = "Option"`
- [ ] An unrecognised `trans_code` row is stored with `includeInXIRR = false` and `rawAction` preserved — the parser does not throw
- [ ] `tradeId` / `cashflowId` are deterministic: running the same fixture twice produces identical IDs (verified by E3-T4 helpers)
- [ ] Parser fixture tests cover at least: one BUY, one SELL, one DIVIDEND, one FEE, one option, one unrecognised row

**Demo**
Run the Robinhood parser fixture tests — all pass. Inspect the output for the option row and confirm `optionDetails` contains the correct strike, expiry, and call/put values parsed from the description.

---

### E7-T4 — Implement the Fidelity CSV parser

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Type       | Feature                                           |
| Priority   | P0                                                |
| Status     | To Do                                             |
| Depends on | E7-T2, E3-T4                                      |
| Implements | TRD §2.3 · data model §10.9, §7.4, §7.5 · ADR-015 |

**Description**
Implement the Fidelity parser for the `FIDELITY_SINGLE_ACC_ACTIVITY` file type. Key rules: the `Action` column drives classification via the `classify` columnMapping kind using Fidelity's word-sets (D7/D9); the trade `Amount` is net of commission and fees (L7) — use it as the cash leg directly, keep commission/fees columns as display-only metadata, do not create separate FEE cashflows from them; `cashBalance` is the per-broker dedup distinguisher for Fidelity; SPAXX/FDRXX money-market sweep rows are stored with `includeInXIRR = false`; EFT rows map to `DEPOSIT` or `WITHDRAWAL` cashflows; REINVESTMENT/DRIP rows map to `BUY` trades; `rawAction` preserved on all items; skip footer rows (non-data rows at the end of the file); safe-fail on unrecognised `Action` values.

**Acceptance Criteria**

- [ ] A Fidelity CSV fixture runs through the parser and produces the expected normalised Trade and Cashflow objects
- [ ] A `YOU BOUGHT` row produces one Trade (BUY) and one Cashflow (BUY, negative, `includeInXIRR = true`)
- [ ] A `YOU SOLD` row produces one Trade (SELL) and one Cashflow (SELL, positive, `includeInXIRR = true`)
- [ ] The Cashflow `amount` for a BUY/SELL row equals the `Amount` column value from the file (net of commission/fees); commission and fees from their respective columns are stored as display metadata on the Trade, not as separate Cashflow items
- [ ] A SPAXX/FDRXX sweep row is stored as a Cashflow with `includeInXIRR = false`
- [ ] An EFT Received row maps to `DEPOSIT`; an EFT Paid row maps to `WITHDRAWAL`
- [ ] A REINVESTMENT row maps to a `BUY` Trade + Cashflow
- [ ] `cashBalance` is used as part of the `cashflowId` fingerprint for dedup (per D2)
- [ ] Footer rows (non-data trailing rows) are skipped without error
- [ ] An unrecognised `Action` value is safe-failed with `includeInXIRR = false` and `rawAction` preserved
- [ ] Parser fixture tests cover: BUY, SELL, DIVIDEND, EFT deposit, EFT withdrawal, sweep, REINVESTMENT, footer skip, unrecognised action

**Demo**
Run the Fidelity parser fixture tests — all pass. Inspect the BUY output and confirm commission/fees are on the Trade as metadata and not present as separate Cashflow items.

---

### E7-T5 — Implement the Zerodha Equity parser (CSV and XLSX)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Type       | Feature                                           |
| Priority   | P0                                                |
| Status     | To Do                                             |
| Depends on | E7-T2, E3-T4                                      |
| Implements | TRD §2.3 · data model §10.9, §7.4, §7.5 · ADR-015 |

**Description**
Implement the Zerodha Equity parser for the `ZERODHA_EQUITY` file type. Zerodha files may be CSV or XLSX — the parser must handle both formats transparently (detect from file extension or content-type). Key rules: `trade_id` is the per-broker dedup distinguisher for Zerodha (D2); `isin` is stored as `securityId` on the Trade (D8); dates are ISO format from Zerodha (D11); option symbols are not present in equity files; `rawAction` (`buy`/`sell`) is preserved; `instrumentType` is derived from the instrument column (`EQ` → `Stock`, `ETF` markers → `ETF`, default `Stock`); all rows are buy/sell equity trades — each produces one Trade and one Cashflow. Zerodha fees/charges are NOT in this file and are not captured (OQ-I, Phase 2).

**Acceptance Criteria**

- [ ] A Zerodha Equity CSV fixture and a Zerodha Equity XLSX fixture both run through the parser and produce identical normalised output
- [ ] Each row produces one Trade (BUY or SELL) and one Cashflow (BUY negative / SELL positive, `includeInXIRR = true`)
- [ ] `tradeId` uses `trade_id` from the file as part of its deterministic fingerprint (per D2)
- [ ] `isin` from the file is stored as `securityId` on the Trade with `securityIdType = "ISIN"`
- [ ] Dates in the file (ISO format) are parsed correctly and stored in `YYYY-MM-DD` format on the Trade SK
- [ ] No fee or charge cashflows are created — Zerodha equity files carry no per-trade charges
- [ ] `rawAction` is preserved as the original `buy`/`sell` string
- [ ] Parser fixture tests cover: BUY row (CSV), SELL row (CSV), BUY row (XLSX), SELL row (XLSX), and a row with a non-null `isin`

**Demo**
Run the Zerodha Equity fixture tests for both CSV and XLSX — all pass. Confirm the XLSX and CSV fixtures for the same row produce identical `tradeId` values.

---

### E7-T6 — Implement the Zerodha F&O parser (CSV and XLSX)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Type       | Feature                                           |
| Priority   | P0                                                |
| Status     | To Do                                             |
| Depends on | E7-T2, E3-T4                                      |
| Implements | TRD §2.3 · data model §10.9, §7.4, §7.5 · ADR-015 |

**Description**
Implement the Zerodha F&O parser for the `ZERODHA_FO` file type. Handles both CSV and XLSX. Key rules: all F&O trades have `instrumentType = "Option"` in Phase 1 (IndexOption → Phase 2 backfill, OQ-T); `optionDetails` (strike, expiry, call/put) are parsed from the instrument name column (extract kind, D10); `trade_id` is the dedup distinguisher; the F&O file has no open/close flag (OQ-B — accepted limitation, not a blocker); dates are ISO format; no fee cashflows from this file. Each row produces one Trade and one Cashflow.

**Acceptance Criteria**

- [ ] A Zerodha F&O CSV fixture and XLSX fixture both parse to identical normalised output
- [ ] Each row produces one Trade with `instrumentType = "Option"` and one Cashflow
- [ ] `optionDetails` is populated with `strike`, `expiry`, and `callPut` parsed from the instrument name column
- [ ] NIFTY, BANKNIFTY, and SENSEX option rows are all tagged `instrumentType = "Option"` in Phase 1 (IndexOption distinction is a Phase-2 item — OQ-T)
- [ ] `trade_id` is used as part of the deterministic `tradeId` fingerprint
- [ ] An instrument name that cannot be parsed into valid option details safe-fails: the row is stored with `optionDetails = null` and `rawAction` preserved — the parser does not throw
- [ ] Parser fixture tests cover: a NIFTY call buy, a BANKNIFTY put sell, a SENSEX option, and one unparseable instrument name

**Demo**
Run the Zerodha F&O fixture tests — all pass. Inspect the output for a NIFTY call row and confirm `optionDetails.callPut = "CE"`, `optionDetails.strike` and `optionDetails.expiry` are correctly parsed.

---

### E7-T7 — Implement Layer-2 dedup, normalisation orchestration, and preview parking

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Type       | Feature                                                            |
| Priority   | P0                                                                 |
| Status     | To Do                                                              |
| Depends on | E7-T3, E7-T4, E7-T5, E7-T6, E3-T3b                                 |
| Implements | TRD §2.3 · FR-D1, FR-D2 · AP-7 · ADR-005 · data model §10.1, §10.8 |

**Description**
In the import pipeline core (E7-T2), after the correct parser produces normalised rows, apply Layer-2 deduplication: for each Trade and Cashflow, check if an item with that deterministic `tradeId`/ `cashflowId` already exists in DynamoDB (AP-7). Classify each row as `new`, `duplicate`, or `unsupported`. Normalise only the `new` + `supported` rows (the parsers in E7-T3 through E7-T6 already handle this). Find-or-create the `BrokerAccount` by `(userId, broker)` using an idempotent conditional write. Park the classified, normalised batch as a JSON object in S3 at `temp/<userId>/<importId>/batch.json`. Update `ImportedFile.status = PREVIEW_READY` with counts: `newRows`, `duplicateRows`, `unsupportedRows`.

**Acceptance Criteria**

- [ ] After processing, the `ImportedFile` item has `status = PREVIEW_READY` and counts for `newRows`, `duplicateRows`, and `unsupportedRows`
- [ ] A `BrokerAccount` item is created for the `(userId, broker)` combination if one does not exist; if it does exist, it is not modified (idempotent find-or-create)
- [ ] The normalised batch is stored as a JSON file at `temp/<userId>/<importId>/batch.json` in S3
- [ ] Running the same import job twice (SQS redelivery simulation) produces the same `newRows`/`duplicateRows` counts and does not corrupt the parked batch (idempotent)
- [ ] Rows from a previous import of the same broker are classified as `duplicate` (their `tradeId`/`cashflowId` already exist); only genuinely new rows are `new`
- [ ] A partially-overlapping file (some rows already imported in a previous file, some new — e.g. an overlapping date-range re-export) is classified correctly by the Layer-2 record check: the already-seen rows are `duplicate` and only the genuinely new rows are `new`, so `newRows` + `duplicateRows` = total supported rows

**Demo**
Import a Robinhood fixture. Check `ImportedFile.status = PREVIEW_READY` and the counts. Import the same fixture a second time as a new import (bypass Layer-1 for this test). Confirm `newRows = 0` and `duplicateRows = N` — no duplicate Trade items in DynamoDB.

---

### E7-T8 — Implement the preview endpoint

| Field      | Value                               |
| ---------- | ----------------------------------- |
| Type       | Feature                             |
| Priority   | P0                                  |
| Status     | To Do                               |
| Depends on | E7-T7, E5-T2                        |
| Implements | TRD §2.3 · FR-I4 · data model §10.8 |

**Description**
Implement `GET /import/:importId/preview` in `import-api` as a `protectedProcedure`. Available only when `ImportedFile.status = PREVIEW_READY`. Reads the parked normalised batch from S3 and returns: the counts (`newRows`, `duplicateRows`, `unsupportedRows`), the normalised rows that will be imported (the `new` rows), and the rows that will be skipped (the `duplicate` and `unsupported` rows). The frontend shows this to the user before they confirm. Requesting preview for an import not yet in `PREVIEW_READY` status returns `BAD_REQUEST`.

**Acceptance Criteria**

- [ ] `GET /import/:importId/preview` returns `{ counts, importRows, skippedRows }` when `ImportedFile.status = PREVIEW_READY`
- [ ] `importRows` contains the normalised Trade and Cashflow objects that will be written on confirm
- [ ] `skippedRows` contains the rows classified as duplicate or unsupported, each with a `reason` field (`"duplicate"` or `"unsupported"`)
- [ ] Requesting preview when status is `PROCESSING` or `UPLOADED` returns `BAD_REQUEST` with a message that the preview is not ready yet
- [ ] Requesting preview for another user's import returns `NOT_FOUND`
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Complete a full flow through Gate 1 and wait for the worker to park the batch. Call `GET /import/:importId/preview` — confirm the response contains the counts, the normalised import rows, and the skipped rows with reasons.

---

### E7-T9 — Implement Gate 2: confirm and write to DynamoDB

| Field      | Value                                            |
| ---------- | ------------------------------------------------ |
| Type       | Feature                                          |
| Priority   | P0                                               |
| Status     | To Do                                            |
| Depends on | E7-T8, E3-T3a                                    |
| Implements | TRD §2.3 · FR-I4 · AP-8, AP-9 · ADR-005, ADR-016 |

**Description**
Implement `POST /import/:importId/confirm` in `import-api` as a `protectedProcedure`. This is Gate 2 — the user has reviewed the preview and clicks "Confirm". The endpoint validates the import is in `PREVIEW_READY` status and belongs to the requesting user, updates status to `COMMITTING`, and enqueues a commit job on SQS. The worker picks up the commit job, reads the parked normalised batch from S3, and executes the write phase: (a) copies the raw file from `temp/<userId>/<uploadId>` to the permanent key `<userId>/<contentHash>` in S3 (ADR-016); (b) updates the `ImportedFile` record with `s3Key` and `status = COMPLETE`; (c) writes each Trade and Cashflow with `attribute_not_exists(PK)` — Layer-2 is re-enforced at write time. Deletes both temp S3 objects on success.

**Acceptance Criteria**

- [ ] `POST /import/:importId/confirm` updates `ImportedFile.status` from `PREVIEW_READY` to `COMMITTING` and enqueues a commit job
- [ ] After the worker processes the commit job, `ImportedFile.status` is `COMPLETE` and `ImportedFile.s3Key` is set to `<userId>/<contentHash>`
- [ ] The permanent S3 key `<userId>/<contentHash>` contains the original raw file bytes
- [ ] Both temp S3 objects (`temp/<userId>/<uploadId>` and `temp/<userId>/<importId>/batch.json`) are deleted after a successful commit
- [ ] Each Trade and Cashflow write uses `attribute_not_exists(PK)` — if a record already exists (concurrent re-confirmation), it is silently skipped and no error is thrown
- [ ] Confirming the same import a second time (idempotency test) does not create duplicate Trade/Cashflow items
- [ ] Calling confirm on an import not in `PREVIEW_READY` status returns `BAD_REQUEST`
- [ ] Calling confirm on another user's import returns `NOT_FOUND`

**Demo**
Complete the full two-gate flow with a Robinhood fixture: upload → detect → proceed → wait for PREVIEW_READY → preview → confirm → poll until COMPLETE. Confirm Trade and Cashflow items exist in DynamoDB Local. Run the entire flow a second time with the same file — confirm Layer-1 catches it as a duplicate before Gate 1. Manually bypass Layer-1 and run Gate 2 twice — confirm no duplicate Trade items are created.

## Epic 8 — Trade History & XIRR

> **Goal.** A user can view all their imported trades in a single unified list, filter by broker or ticker, open a trade's detail, and see their portfolio's rate of return per currency.
> **Outcome.** The `app-api` Lambda serves the `trades.*` and `xirr.*` tRPC procedures. A user with imported trades sees a paginated, chronological list across all brokers, can filter it down, and sees a per-currency XIRR figure that accounts for every cashflow and values open positions at the current market price. The INR figure is accompanied by a notice that it excludes Zerodha fees.
> **Note.** The market-data integration (fetching live prices) is built in E11. The XIRR procedure in this epic calls the price-cache read function from E3-T5 — if the cache is empty (no price yet), it marks the affected position as unvalued and returns a partial XIRR with a notice. Full end-to-end XIRR with live prices works after E11.

---

### E8-T1 — Implement trades.list — unified paginated trade history

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| Type       | Feature                                     |
| Priority   | P0                                          |
| Status     | To Do                                       |
| Depends on | E5-T2, E3-T3b                               |
| Implements | TRD §4.3 · FR-H1 · AP-10 · ADR-002, ADR-009 |

**Description**
Implement the `trades.list` tRPC procedure in `app-api`. Returns all of the authenticated user's trades across all brokers and accounts, newest first, with cursor-based pagination (default page size 50). Each item in the response includes: `tradeId`, `date`, `broker`, `accountId`, `symbol`, `instrumentType`, `action` (BUY/SELL), `quantity`, `price`, `currency`, and `rawAction`. The query is scoped strictly to the requesting user's `USER#<userId>` partition — no cross-user data is possible.

**Acceptance Criteria**

- [ ] `trades.list` returns trades for the authenticated user ordered newest first (descending by date)
- [ ] The response shape is `{ items: Trade[], nextCursor?: string }`; passing `nextCursor` as `cursor` in the next call returns the next page
- [ ] Trades from all brokers (Robinhood, Fidelity, Zerodha EQ, Zerodha F&O) appear in the same list, interleaved by date
- [ ] A user with no trades receives `{ items: [], nextCursor: undefined }`
- [ ] Calling `trades.list` with another user's token never returns that other user's trades — isolation is structural via the `USER#<userId>` partition key
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Import fixtures for two different brokers for the same user. Call `trades.list` and confirm trades from both brokers appear, ordered newest first. Call with a second user's token — confirm only that user's trades are returned.

---

### E8-T2 — Implement trades.listByBroker and trades.listByTicker

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Type       | Feature                                       |
| Priority   | P0                                            |
| Status     | To Do                                         |
| Depends on | E8-T1, E3-T3b                                 |
| Implements | TRD §4.3 · FR-H2, FR-H3, FR-M1 · AP-11, AP-30 |

**Description**
Implement two filtered variants of the trade list in `app-api`. `trades.listByBroker(broker)` uses GSI1 (`USER#<userId>#BROKER#<broker>`) to return only trades for the specified broker, newest first, paginated. `trades.listByTicker(canonicalSymbol)` uses GSI3 (`USER#<userId>#SYM#<canonicalSymbol>`) to return only trades for the specified ticker across all brokers and accounts, newest first, paginated. Both procedures are `protectedProcedure` and return the same item shape as `trades.list`.

**Acceptance Criteria**

- [ ] `trades.listByBroker("Robinhood")` returns only the user's Robinhood trades; Fidelity or Zerodha trades are not included
- [ ] `trades.listByBroker` with an unrecognised broker name returns `{ items: [], nextCursor: undefined }` — not an error
- [ ] `trades.listByTicker("AAPL")` returns only trades where `symbol = "AAPL"` across all brokers
- [ ] `trades.listByTicker` uses the canonical symbol (post symbol resolution) — a trade imported as `FB` that was resolved to `META` is returned by `trades.listByTicker("META")`
- [ ] Both procedures support cursor-based pagination and return the same `{ items, nextCursor }` shape
- [ ] Both procedures are scoped to the requesting user — another user's trades are never returned

**Demo**
Import Robinhood and Fidelity fixtures containing AAPL trades. Call `trades.listByBroker("Robinhood")` — confirm only Robinhood trades. Call `trades.listByTicker("AAPL")` — confirm AAPL trades from both brokers appear. Call `trades.listByBroker("Zerodha")` with no Zerodha imports — confirm an empty list, not an error.

---

### E8-T3 — Implement trades.get — single trade detail

| Field      | Value                    |
| ---------- | ------------------------ |
| Type       | Feature                  |
| Priority   | P0                       |
| Status     | To Do                    |
| Depends on | E8-T1, E3-T3b            |
| Implements | TRD §4.3 · FR-H4 · AP-12 |

**Description**
Implement `trades.get(tradeId)` in `app-api` as a `protectedProcedure`. Returns the full detail of a single trade including all attributes: base fields plus `optionDetails` (if present), `securityId`, `securityIdType`, `brokerTradeId`, `rawAction`, and the associated `BrokerAccount` display name. Returns `NOT_FOUND` for a non-existent trade or a trade belonging to a different user — no information is leaked about whether the trade exists.

**Acceptance Criteria**

- [ ] `trades.get(tradeId)` returns the full trade object for a trade belonging to the authenticated user
- [ ] For an options trade, the response includes a populated `optionDetails` object with `strike`, `expiry`, and `callPut`
- [ ] For an equity trade, `optionDetails` is `null` or absent
- [ ] Requesting a trade that belongs to a different user returns `NOT_FOUND` (not `FORBIDDEN`)
- [ ] Requesting a non-existent `tradeId` returns `NOT_FOUND`
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Import a fixture containing an option trade. Call `trades.get` with the option trade's `tradeId` — confirm `optionDetails` is populated. Call with a valid token but a different user's `tradeId` — confirm `NOT_FOUND`.

---

### E8-T4 — Implement XIRR cashflow assembly and calculation

| Field      | Value                                                          |
| ---------- | -------------------------------------------------------------- |
| Type       | Feature                                                        |
| Priority   | P0                                                             |
| Status     | To Do                                                          |
| Depends on | E8-T1, E3-T3b                                                  |
| Implements | TRD §4.3 · FR-X1, FR-X2, FR-X3, FR-M2 · AP-13, AP-14 · ADR-007 |

**Description**
Implement the `xirr.get` tRPC procedure in `app-api`. For each currency present in the user's cashflows (USD and/or INR), the procedure: (1) fetches all cashflows for that currency via the `CASHFLOW#<currency>#` prefix query (AP-13), filtering to only rows where `includeInXIRR = true`; (2) derives current open positions by netting Trade records (buys minus sells per symbol, AP-14 — no stored Holdings item); (3) for each open position, reads the current price from the price-cache (AP-28); (4) adds a synthetic terminal cashflow (positive, today's date, quantity × current price) for each valued open position; (5) runs the XIRR algorithm over the assembled cashflow timeline and returns the annualised rate. If a position's price is not in the cache, it is excluded from the terminal valuation and flagged in the response.

**Acceptance Criteria**

- [ ] `xirr.get` returns a separate XIRR result for each currency in which the user has `includeInXIRR = true` cashflows
- [ ] A user with only USD cashflows sees one result (`USD`); a user with both USD and INR sees two results — they are never combined
- [ ] Cashflows with `includeInXIRR = false` (sweeps, RSU-tax adjustments) are excluded from the XIRR calculation
- [ ] Open positions (netted from Trade records) are valued at the current price from the price-cache; a position with no cached price is excluded from the terminal valuation and listed in a `unpricedPositions` array in the response
- [ ] Re-uploading a file (all duplicate trades) does not change the XIRR result — idempotency carries through to the calculation
- [ ] A user with no cashflows receives an empty array response, not an error
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Import a Robinhood fixture with BUY and SELL trades and a dividend. Manually insert a price-cache item for an open position. Call `xirr.get` — confirm a USD XIRR figure is returned. Remove the price-cache item — confirm the position appears in `unpricedPositions` and XIRR is still returned (partial).

---

### E8-T5 — Implement the XIRR algorithm

| Field      | Value            |
| ---------- | ---------------- |
| Type       | Enabler          |
| Priority   | P0               |
| Status     | To Do            |
| Depends on | —                |
| Implements | TRD §3.1 · FR-X1 |

**Description**
Implement (or integrate a well-tested npm package for) the XIRR algorithm in a standalone utility module. XIRR takes an array of `{ amount: number, date: Date }` cashflows and returns the annualised internal rate of return as a decimal. The function must handle edge cases: all-negative cashflows (no return possible — return `null`), a single cashflow (return `null`), and a cashflow array that does not converge (return `null` with no throw). The module has no DynamoDB or AWS dependency — it is a pure function testable in isolation.

**Acceptance Criteria**

- [ ] Given a known cashflow sequence (e.g. −1000 on day 0, +1100 after one year), `xirr` returns a value within 0.0001 of the expected 0.1 (10%)
- [ ] Given all-negative cashflows, `xirr` returns `null` without throwing
- [ ] Given a single cashflow, `xirr` returns `null` without throwing
- [ ] Given a non-converging sequence, `xirr` returns `null` without throwing
- [ ] The function is a pure module with no side effects — the same inputs always produce the same output
- [ ] Unit tests cover: a positive-return case, a negative-return case, the all-negative edge case, the single-cashflow edge case, and a known real-world sequence validated against a spreadsheet XIRR result

**Demo**
Run the XIRR unit tests — all pass. Confirm the known-sequence test matches the expected spreadsheet result within tolerance.

---

### E8-T6 — Add the INR fee-exclusive notice to the XIRR response

| Field      | Value                       |
| ---------- | --------------------------- |
| Type       | Feature                     |
| Priority   | P0                          |
| Status     | To Do                       |
| Depends on | E8-T4                       |
| Implements | TRD §4.3 · FR-X2 · PRD §7.5 |

**Description**
Extend the `xirr.get` response to include a `notice` field on the INR result. The notice states that the INR XIRR excludes Zerodha fees and charges (brokerage, STT, GST, stamp duty) because these are not present in the Zerodha equity and F&O trade files imported in Phase 1. The USD result carries no notice. The notice is a fixed string defined in the backend — the frontend displays it as-is alongside the INR figure.

**Acceptance Criteria**

- [ ] The `xirr.get` response for a USD result has `notice: null`
- [ ] The `xirr.get` response for an INR result has a non-null `notice` field containing a human-readable string that explicitly mentions Zerodha fees/charges being excluded
- [ ] The notice is present on the INR result regardless of whether the user has Zerodha trades — it is tied to the currency, not to the presence of specific imports
- [ ] The notice string is defined as a constant in the backend, not constructed dynamically

**Demo**
Import a Zerodha equity fixture. Call `xirr.get` — confirm the INR result has a non-null `notice` field and the USD result (if present) has `notice: null`.

---

## Epic 9 — Journal, Tags & Scorecard

> **Goal.** A user can attach journal entries to trades, tag those entries with user-defined labels, evaluate a prediction to get a Win/Loss/Breakeven outcome, and view a ranked scorecard of how reliable each tag/source has been.
> **Outcome.** The `journal.*`, `tags.*`, and `evaluation.*` tRPC procedures are live in `app-api`. A user can journal a trade, add multiple entries with multiple tags, click Evaluate on an entry, and see the tag's win/loss counter update atomically. The ranked tag list shows every tag's running record.

---

### E9-T1 — Implement tags.list and tags.create

| Field      | Value                           |
| ---------- | ------------------------------- |
| Type       | Feature                         |
| Priority   | P0                              |
| Status     | To Do                           |
| Depends on | E5-T2, E3-T3a, E3-T3b           |
| Implements | TRD §4.3 · FR-J3 · AP-18, AP-19 |

**Description**
Implement `tags.list` and `tags.create` in `app-api` as `protectedProcedure`s. `tags.create(tagName)` creates a new `Tag` item (`PK = USER#<userId>`, `SK = TAG#<tagName>`) and a corresponding `TagScorecard` item (`SK = TAGSCORE#<tagName>`) with `wins`, `losses`, and `breakeven` initialised to 0, both written idempotently with `attribute_not_exists`. `tags.list` returns all of the user's tags with their current scorecard counters in a single response (no pagination needed — a user will not have thousands of tags).

**Acceptance Criteria**

- [ ] `tags.create("Money Control")` creates a `Tag` item and a `TagScorecard` item with `wins = 0`, `losses = 0`, `breakeven = 0`
- [ ] Calling `tags.create` with the same tag name a second time is idempotent — no duplicate items are created and no error is returned
- [ ] `tags.list` returns all of the user's tags, each with its current `wins`, `losses`, and `breakeven` counts
- [ ] A user with no tags receives an empty array, not an error
- [ ] Tags are scoped to the user — another user's tags are never returned
- [ ] An unauthenticated call to either procedure returns `UNAUTHORIZED`

**Demo**
Create three tags. Call `tags.list` — confirm all three appear with zero counters. Create the same tag name again — confirm the list still shows three tags (no duplicate). Check DynamoDB Local — confirm one `Tag` and one `TagScorecard` item per tag.

---

### E9-T2 — Implement journal.create and journal.listForTrade

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Type       | Feature                                       |
| Priority   | P0                                            |
| Status     | To Do                                         |
| Depends on | E9-T1, E8-T3, E3-T3a, E3-T3b                  |
| Implements | TRD §4.3 · FR-J1, FR-J2 · AP-15, AP-16, AP-17 |

**Description**
Implement `journal.create(tradeId, { notes, prediction, tagNames })` and `journal.listForTrade(tradeId)` in `app-api`. `journal.create` writes a new `JournalEntry` item nested under the trade (`SK = TRADE#<tradeId>#JOURNAL#<entryId>`) with `notes`, `prediction` (BULLISH / BEARISH / NEUTRAL), and a `tagNames` array denormalised onto the entry. It also writes one `JournalEntryTagLink` item per tag (the GSI2 feed). The trade must belong to the requesting user — attempting to journal another user's trade returns `NOT_FOUND`. `journal.listForTrade` returns all entries for a trade newest first, each with its `tagNames` array.

**Acceptance Criteria**

- [ ] `journal.create` writes a `JournalEntry` item with `notes`, `prediction`, and `tagNames` populated
- [ ] For a journal entry with two tags, two `JournalEntryTagLink` items are written (one per tag), each with the correct `GSI2PK` and `GSI2SK` for the tag→entries query
- [ ] `journal.listForTrade(tradeId)` returns all entries for that trade newest first, each with its `tagNames` array
- [ ] A trade can have multiple journal entries — calling `journal.create` twice on the same trade results in two distinct entries
- [ ] Attempting to create a journal entry for a trade belonging to a different user returns `NOT_FOUND`
- [ ] A trade with no journal entries returns an empty array from `journal.listForTrade`
- [ ] `prediction` is optional — omitting it stores `null`; passing an invalid value (not BULLISH / BEARISH / NEUTRAL) returns `BAD_REQUEST`

**Demo**
Create two journal entries on the same trade, one with tags ["swing trade", "earnings play"] and one with tag ["Money Control"]. Call `journal.listForTrade` — confirm both entries are returned with their respective `tagNames`. Check DynamoDB Local — confirm three `JournalEntryTagLink` items exist (two for entry 1, one for entry 2).

---

### E9-T3 — Implement journal.get and journal.attachTags

| Field      | Value                           |
| ---------- | ------------------------------- |
| Type       | Feature                         |
| Priority   | P0                              |
| Status     | To Do                           |
| Depends on | E9-T2                           |
| Implements | TRD §4.3 · FR-J3 · AP-17, AP-20 |

**Description**
Implement `journal.get(entryId)` and `journal.attachTags(entryId, tagNames)` in `app-api`. `journal.get` returns a single journal entry by its ID with all attributes including `tagNames`. `journal.attachTags` adds one or more tags to an existing entry: it appends the new tag names to the `tagNames` array on the `JournalEntry` item and writes the additional `JournalEntryTagLink` items. Tags already present on the entry are not duplicated. Both procedures enforce ownership — only the entry's owner can read or modify it.

**Acceptance Criteria**

- [ ] `journal.get(entryId)` returns the full entry including `notes`, `prediction`, `tagNames`, and `evaluation` (null if not yet evaluated)
- [ ] `journal.get` for another user's entry returns `NOT_FOUND`
- [ ] `journal.attachTags(entryId, ["new tag"])` appends "new tag" to the entry's `tagNames` and writes a new `JournalEntryTagLink`
- [ ] Attaching a tag that is already on the entry is idempotent — no duplicate tag name appears in `tagNames` and no duplicate link item is created
- [ ] Attaching tags to another user's entry returns `NOT_FOUND`
- [ ] An unauthenticated call to either procedure returns `UNAUTHORIZED`

**Demo**
Create a journal entry with one tag. Call `journal.attachTags` to add a second tag. Call `journal.get` — confirm both tags are in `tagNames`. Call `journal.attachTags` again with the same second tag — confirm `tagNames` still has two entries (no duplicate). Check DynamoDB Local — confirm the correct number of `JournalEntryTagLink` items.

---

### E9-T4 — Implement journal.listByTag

| Field      | Value                              |
| ---------- | ---------------------------------- |
| Type       | Feature                            |
| Priority   | P0                                 |
| Status     | To Do                              |
| Depends on | E9-T2                              |
| Implements | TRD §4.3 · FR-S2 · AP-21 · ADR-004 |

**Description**
Implement `journal.listByTag(tagName)` in `app-api` as a `protectedProcedure`. Uses GSI2 (`USER#<userId>#TAG#<tagName>`) to return all journal entries that carry a given tag, newest first, with cursor-based pagination. Each item in the response includes the full `JournalEntry` attributes (notes, prediction, evaluation, tagNames) plus the `tradeId` it belongs to. This powers the "all entries for this source" view that backs the scorecard drill-down.

**Acceptance Criteria**

- [ ] `journal.listByTag("Money Control")` returns all of the user's journal entries tagged "Money Control", newest first
- [ ] Each returned entry includes `entryId`, `tradeId`, `notes`, `prediction`, `evaluation`, and `tagNames`
- [ ] The response is paginated: `{ items, nextCursor? }` with default page size 50
- [ ] Calling `journal.listByTag` for a tag with no entries returns an empty array, not an error
- [ ] Entries from a different user tagged with the same tag name are never returned — isolation holds through the GSI
- [ ] An unauthenticated call returns `UNAUTHORIZED`

**Demo**
Create five journal entries, three tagged "Money Control" and two tagged "earnings play". Call `journal.listByTag("Money Control")` — confirm exactly three entries are returned. Call with "earnings play" — confirm two. Call with "unknown tag" — confirm empty array.

---

### E9-T5 — Implement evaluation.evaluate and atomic scorecard update

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Type       | Feature                                       |
| Priority   | P0                                            |
| Status     | To Do                                         |
| Depends on | E9-T2, E3-T3a, E3-T3b                         |
| Implements | TRD §4.3 · FR-E1, FR-E2, FR-S1 · AP-22, AP-23 |

**Description**
Implement `evaluation.evaluate(entryId)` in `app-api` as a `protectedProcedure`. The procedure: (1) fetches the current price for the entry's symbol from the price-cache (AP-28); (2) compares it to the trade's price and the entry's `prediction` to compute `WIN`, `LOSS`, or `BREAKEVEN`; (3) writes the `evaluation` result and `evaluatedAt` timestamp onto the `JournalEntry` item (AP-22); (4) for each tag on the entry, atomically increments the appropriate counter (`wins`, `losses`, or `breakeven`) on the `TagScorecard` item using DynamoDB `ADD` (AP-23). If the price-cache has no entry for the symbol, return `BAD_REQUEST` with a clear message that the price is not available — do not write a partial evaluation.

**Acceptance Criteria**

- [ ] Given a BULLISH prediction and a current price above the trade price, `evaluate` returns `WIN` and sets the entry's `evaluation = "WIN"`
- [ ] Given a BULLISH prediction and a current price below the trade price, `evaluate` returns `LOSS`
- [ ] Given a BEARISH prediction and a current price below the trade price, `evaluate` returns `WIN`
- [ ] After evaluation, each tag on the entry has its corresponding counter incremented by exactly 1 on its `TagScorecard` item
- [ ] Evaluating the same entry a second time overwrites the previous evaluation result and adjusts the scorecard counters correctly (decrements the old outcome, increments the new one)
- [ ] If the price-cache has no current price for the symbol, `evaluate` returns `BAD_REQUEST` — no `evaluation` is written and no scorecard is modified
- [ ] Evaluating another user's entry returns `NOT_FOUND`

**Demo**
Create a BULLISH journal entry for an AAPL trade. Manually insert a price-cache item with a price above the trade price. Call `evaluation.evaluate` — confirm `WIN` is returned and the `TagScorecard` `wins` counter incremented by 1. Remove the price-cache item and call again — confirm `BAD_REQUEST` and the scorecard is unchanged.

---

### E9-T6 — Implement evaluation.getScorecard and evaluation.listRanked

| Field      | Value                           |
| ---------- | ------------------------------- |
| Type       | Feature                         |
| Priority   | P0                              |
| Status     | To Do                           |
| Depends on | E9-T5, E3-T3b                   |
| Implements | TRD §4.3 · FR-S2 · AP-24, AP-25 |

**Description**
Implement two read procedures in `app-api`. `evaluation.getScorecard( tagName)` returns the `TagScorecard` for a single tag: `wins`, `losses`, `breakeven`, and the tag name. `evaluation.listRanked` returns all of the user's `TagScorecard` items sorted by win rate descending (wins / (wins + losses), ties broken by total evaluated entries descending). Tags with zero evaluated entries (wins + losses + breakeven = 0) are included at the bottom of the ranked list.

**Acceptance Criteria**

- [ ] `evaluation.getScorecard("Money Control")` returns the current `wins`, `losses`, and `breakeven` counts for that tag
- [ ] `evaluation.getScorecard` for a tag that does not exist returns `NOT_FOUND`
- [ ] `evaluation.listRanked` returns all of the user's tags sorted by win rate descending; a tag with 7W/2L appears above a tag with 4W/5L
- [ ] Tags with a win rate of 0% (0 wins, some losses) appear below tags with any wins
- [ ] Tags with zero total evaluations appear at the bottom of the list
- [ ] Both procedures are scoped to the requesting user — another user's scorecards are never returned
- [ ] An unauthenticated call to either procedure returns `UNAUTHORIZED`

**Demo**
Create three tags and evaluate entries so the scorecards are: "Money Control" 7W/2L, "Shrivatsav" 4W/5L, "earnings play" 0W/0L. Call `evaluation.listRanked` — confirm the order is Money Control, Shrivatsav, earnings play. Call `evaluation.getScorecard("Money Control")` — confirm `wins: 7`, `losses: 2`.

## Epic 10 — Trade Price Chart

> **Goal.** Opening an equity trade (Stock or ETF) shows a historical price chart for that ticker with the user's buy and sell transactions marked on it. The user can switch between 1-month, 6-month, and 1-year views. Non-equity trades (options, funds) show a clear message that no chart is available.
> **Outcome.** The `trades.getChartSeries` tRPC procedure is live. It returns the historical daily price series (sliced to the requested range from a cached 1-year series) and the list of the user's buy/sell markers for that ticker and currency. The frontend (E12) renders the chart using this data.
> **Note.** This epic depends on E11 for the actual market-data fetch. The procedure is fully implemented here, but end-to-end chart rendering with live data requires E11 to be complete. Until then, the demo uses a manually inserted `PRICEHIST#` cache item.
> **Infrastructure note.** This epic provisions the price-cache DynamoDB table in CDK — the first time that table exists.

---

### E10-T1 — Provision the price-cache table in CDK

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| Type       | Enabler                                     |
| Priority   | P0                                          |
| Status     | To Do                                       |
| Depends on | E1-T2                                       |
| Implements | TRD §7.1 · data model §9 · ADR-003, ADR-008 |

**Description**
Add the price-cache DynamoDB table to the CDK stack. The table holds two item types: `PRICE#<canonicalSymbol>#<currency>` (current prices, AP-28/AP-29) and `PRICEHIST#<canonicalSymbol>#<currency>` (historical daily series, AP-31/AP-32). No sort key. TTL on the `expiresAt` attribute. On-demand capacity. PITR off — this table is ephemeral and rebuildable. Grant the `app-api` Lambda read/write access to the price-cache table; the `import-worker` Lambda read/write access (needed for symbol resolution during normalisation); no other Lambda needs access.

**Acceptance Criteria**

- [ ] The CDK stack defines the price-cache table with no sort key, TTL on `expiresAt`, on-demand capacity, and PITR disabled
- [ ] The `app-api` Lambda IAM role includes read/write access to the price-cache table
- [ ] The `import-worker` Lambda IAM role includes read/write access to the price-cache table
- [ ] No other Lambda's IAM role includes price-cache table access
- [ ] `cdk synth` produces the table with the correct configuration
- [ ] The local bootstrap script is updated to create the price-cache table in DynamoDB Local

**Demo**
Run `cdk deploy` (or local bootstrap) and confirm the price-cache table exists with TTL enabled and no sort key.

---

### E10-T2 — Implement trades.getChartSeries

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| Type       | Feature                                     |
| Priority   | P1                                          |
| Status     | To Do                                       |
| Depends on | E10-T1, E8-T2, E3-T3b, E3-T5                |
| Implements | TRD §4.3, §6.3, §6.4 · FR-H5 · AP-30, AP-31 |

**Description**
Implement `trades.getChartSeries(tradeId, range)` in `app-api` as a `protectedProcedure`. The `range` parameter accepts `"1M"`, `"6M"`, or `"1Y"`. The procedure: (1) fetches the trade to verify ownership and confirm it is a Stock or ETF (`instrumentType` is `"Stock"` or `"ETF"`) — non-equity trades return a `{ chartAvailable: false }` response; (2) reads the `PRICEHIST#<canonicalSymbol>#<currency>` item from the price-cache; (3) if found and fresh (`fetchedDate == today`), slices the series to the requested range (last ~30 days for 1M, ~180 for 6M, full series for 1Y) and drops any provisional current-day bar (last-completed-session rule); (4) if not found or stale, triggers a fetch via the market-data interface (E11) then serves the sliced result; (5) fetches the user's buy/sell trades for that ticker via AP-30 (GSI3) and returns them as markers with `date`, `price`, `quantity`, and `action` (BUY/SELL).

**Acceptance Criteria**

- [ ] `trades.getChartSeries(tradeId, "1Y")` for an equity trade returns `{ chartAvailable: true, series: DailyClose[], markers: Marker[], asOf: string }`
- [ ] `series` contains daily closes ending at the last completed trading session — no in-progress current-day bar is included
- [ ] `asOf` is the date of the last point in `series` (the last completed session date)
- [ ] `trades.getChartSeries(tradeId, "1M")` returns approximately the last 30 days of the 1-year cached series — no extra fetch is made when the 1Y series is already cached
- [ ] `trades.getChartSeries(tradeId, "6M")` returns approximately the last 180 days
- [ ] `markers` contains one entry per buy or sell trade the user has for that ticker in the same currency — trades in a different currency are excluded
- [ ] For an options, index-option, mutual fund, or money-market trade, `getChartSeries` returns `{ chartAvailable: false }` — no series or markers
- [ ] Requesting the series for another user's trade returns `NOT_FOUND`

**Demo**
Manually insert a `PRICEHIST#` cache item with 365 daily closes. Call `getChartSeries` with `"1Y"` — confirm all 365 points are returned. Call with `"1M"` — confirm ~30 points are returned from the same cache item (no second fetch). Call with an option trade's `tradeId` — confirm `{ chartAvailable: false }`.

---

### E10-T3 — Implement the last-completed-session rule in the series adapter

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P1       |
| Status     | To Do    |
| Depends on | E10-T2   |
| Implements | TRD §6.4 |

**Description**
Implement a pure utility function `stripIncompleteBar(series, now)` that takes an array of daily closes (each with a `date` and `close` field) and the current datetime, and removes any bar whose date is today if the market session for that exchange has not yet completed. This function is called inside `getChartSeries` before the series is sliced and returned. For Phase 1, "session completed" means the bar's date is strictly before today's date — any bar dated today is dropped regardless of time, as a safe conservative rule. The `asOf` date in the response is the date of the last remaining bar after stripping.

**Acceptance Criteria**

- [ ] Given a series whose last bar is dated today, `stripIncompleteBar` removes it and the last bar in the output is yesterday's close
- [ ] Given a series whose last bar is dated yesterday (e.g. Friday when today is Saturday), `stripIncompleteBar` makes no change
- [ ] Given a series where the last bar is dated two days ago (e.g. a holiday), `stripIncompleteBar` makes no change
- [ ] The function is pure — same inputs always produce the same output; it has no DynamoDB or network dependency
- [ ] Unit tests cover: last bar is today (stripped), last bar is yesterday (unchanged), last bar is a week ago (unchanged), empty series (returns empty)

**Demo**
Run the unit tests for `stripIncompleteBar` — all pass. Manually insert a `PRICEHIST#` cache item whose last bar is today's date. Call `getChartSeries` — confirm `asOf` is yesterday's date, not today's.

---

### E10-T4 — Implement graceful degradation for unavailable chart data

| Field      | Value            |
| ---------- | ---------------- |
| Type       | Feature          |
| Priority   | P1               |
| Status     | To Do            |
| Depends on | E10-T2           |
| Implements | TRD §6.6 · FR-H5 |

**Description**
Extend `trades.getChartSeries` to handle the case where the market-data provider fails or returns no data. If the provider call fails (network error, timeout, rate limit), serve the last cached series if one exists (even if stale — `fetchedDate` is not today), and include a `dataNotice: "Price data may not be current"` field in the response. If no cached series exists at all, return `{ chartAvailable: true, series: [], markers: [...], dataNotice: "Price data temporarily unavailable" }` — the markers are still returned so the user can see their transactions even without the price line.

**Acceptance Criteria**

- [ ] When the market-data provider call fails and a stale cached series exists, `getChartSeries` returns the stale series with a non-null `dataNotice` field
- [ ] When the provider fails and no cached series exists at all, `getChartSeries` returns `series: []`, the user's `markers`, and a non-null `dataNotice`
- [ ] When the provider succeeds, `dataNotice` is `null`
- [ ] A provider failure never causes `getChartSeries` to throw an unhandled error — it always returns a well-formed response
- [ ] Unit tests cover: provider success (no notice), provider failure with stale cache (stale series + notice), provider failure with no cache (empty series + markers + notice)

**Demo**
Point the market-data adapter at a stub that always throws. Manually insert a stale `PRICEHIST#` cache item. Call `getChartSeries` — confirm the stale series is returned with a non-null `dataNotice`. Delete the cache item and call again — confirm `series: []` with markers and `dataNotice`.

---

## Epic 11 — Market-Data Integration

> **Goal.** The market-data provider abstraction is wired to at least one concrete provider adapter. Current prices and historical daily series are fetched from the provider, stored in the price-cache, and served to XIRR, Evaluate, and the chart procedure. Provider failures degrade gracefully.
> **Outcome.** After this epic, end-to-end XIRR with live prices works, Evaluate fetches a real current price, and the trade chart renders a live historical series. The chosen providers (Kite for INR, Twelve Data for USD) are implemented behind the abstraction interface.
> **Open question (OQ-E) — RESOLVED.** The concrete market-data providers are selected: **INR → Zerodha Kite API**, **USD → Twelve Data**, routed **by currency** behind the abstraction (TRD §6.1). E11-T1 is now an integration-prep task (obtain keys / confirm behaviour), not a selection spike. The abstraction is already locked — swapping providers later is a localised change.

---

### E11-T1 — 🔵 PROVIDER SETUP: obtain keys & confirm behaviour (providers chosen)

| Field      | Value           |
| ---------- | --------------- |
| Type       | Spike           |
| Priority   | P0              |
| Status     | To Do           |
| Depends on | —               |
| Implements | TRD §6.1, §10.1 |

**Description**
The providers are **already selected** (OQ-E resolved): **INR → Zerodha Kite API** (current + historical NSE/BSE prices; also a Phase-2 login provider; requires a **paid historical-data subscription** and a **user Kite session/API key**) and **USD → Twelve Data** (chosen over AlphaVantage, whose ~25 req/day free tier throttles the historical backfill). Routing is **by currency** (INR → Kite, USD → Twelve Data), matching the `(canonicalSymbol, currency)` price-cache key (data model §9.2). This task is the integration-prep: obtain credentials, confirm each provider's current-day-bar behaviour, and verify coverage/limits — not a provider selection.

**Acceptance Criteria**

- [ ] Kite Connect API credentials (and historical-data subscription) obtained; Twelve Data API key obtained
- [ ] It is confirmed whether each provider returns a provisional current-day bar that the `stripIncompleteBar` function (E10-T3) must handle
- [ ] Real coverage spot-checked: Kite returns NSE/BSE current price + 1-year daily history; Twelve Data returns NYSE/NASDAQ current price + 1-year daily history at Phase-1 request volume
- [ ] API keys for both providers are stored as SSM SecureString parameters in CDK (extending E4-T1's pattern)
- [ ] E11-T2 and E11-T3 reference the confirmed provider names before work on them begins

**Demo**
A written record confirms the two providers, credentials in SSM, and the confirmed current-day-bar behaviour for each. A manual call to each provider returns a plausible price for a known ticker.

---

### E11-T2 — Implement the market-data provider abstraction interface

| Field      | Value          |
| ---------- | -------------- |
| Type       | Enabler        |
| Priority   | P0             |
| Status     | To Do          |
| Depends on | E11-T1         |
| Implements | TRD §6.1, §6.2 |

**Description**
Define the internal market-data interface that all callers use — `app-api` (XIRR, Evaluate, chart) and `import-worker` (symbol resolution during normalisation) never call a provider directly. The interface exposes two functions: `getCurrentPrice(canonicalSymbol, currency) → { price, fetchedAt }` and `getDailySeries(canonicalSymbol, currency) → { closes: DailyClose[], fetchedDate }`. Behind the interface, a small router decides which concrete adapter handles a request **by `currency`**: `INR` → Kite adapter, `USD` → Twelve Data adapter. Both cache reads and cache writes are handled inside the interface implementation — callers receive a price, never a cache miss.

**Acceptance Criteria**

- [ ] The market-data interface is defined as a TypeScript interface with `getCurrentPrice` and `getDailySeries` signatures
- [ ] The interface implementation checks the price-cache first (AP-28 for current, AP-31 for history); only on a cache miss does it call the provider adapter
- [ ] On a cache hit, no provider call is made — confirmed by a unit test with a mock adapter that asserts it was never called
- [ ] On a cache miss, the provider is called, the result is written to the cache (AP-29 for current, AP-32 for history), and then returned to the caller
- [ ] The router correctly dispatches `INR` symbols to the Kite adapter and `USD` symbols to the Twelve Data adapter
- [ ] All callers (`app-api`, `import-worker`) import the interface, not a concrete adapter directly

**Demo**
In a unit test, call `getCurrentPrice` twice for the same symbol. Assert the mock adapter was called exactly once (cache hit on the second call). Call for a symbol with a stale cache entry — assert the adapter is called and the cache is updated.

---

### E11-T3 — Implement the concrete provider adapter(s)

| Field      | Value                |
| ---------- | -------------------- |
| Type       | Feature              |
| Priority   | P0                   |
| Status     | To Do                |
| Depends on | E11-T2               |
| Implements | TRD §6.1, §6.2, §6.4 |

**Description**
Implement the concrete provider adapters for the chosen providers (Kite for INR, Twelve Data for USD; credentials set up in E11-T1). Each adapter implements the provider interface: `fetchCurrentPrice(canonicalSymbol, currency)` and `fetchDailySeries(canonicalSymbol, currency)`. The adapter reads its API key via `getSecret()`. For `fetchDailySeries`, the adapter must return a full 1-year daily close series; the `stripIncompleteBar` function (E10-T3) is applied to the result before it is cached. Provider HTTP errors, timeouts, and rate-limit responses are caught and re-thrown as typed errors so the interface's graceful-degradation logic (E11-T4) can handle them.

**Acceptance Criteria**

- [ ] The adapter(s) implement the provider interface and are registered in the router from E11-T2
- [ ] `fetchCurrentPrice` returns a numeric price and a `fetchedAt` timestamp for a valid US equity symbol (e.g. AAPL)
- [ ] `fetchCurrentPrice` returns a numeric price for a valid Indian equity symbol (e.g. a Nifty 50 constituent)
- [ ] `fetchDailySeries` returns at least 250 daily closes (approx. 1 trading year) for a valid US equity symbol
- [ ] `fetchDailySeries` returns at least 250 daily closes for a valid Indian equity symbol
- [ ] A provider HTTP 429 (rate limit) or 5xx is caught and re-thrown as a typed `ProviderError` — it does not crash the Lambda
- [ ] The API key is read via `getSecret()` and never logged

**Demo**
Call `getCurrentPrice("AAPL", "NASDAQ")` against the real provider — confirm a numeric price is returned. Call `getDailySeries("AAPL", "NASDAQ")` — confirm at least 250 daily closes are returned and the last bar is not today's date (stripped by `stripIncompleteBar`). Repeat for one Indian equity symbol.

---

### E11-T4 — Wire market-data into XIRR, Evaluate, and chart; verify end-to-end

| Field      | Value                            |
| ---------- | -------------------------------- |
| Type       | Feature                          |
| Priority   | P0                               |
| Status     | To Do                            |
| Depends on | E11-T3, E8-T4, E9-T5, E10-T2     |
| Implements | TRD §6.6 · FR-X3, FR-PR1, FR-PR2 |

**Description**
Confirm that the three consumers of market data — `xirr.get`, `evaluation.evaluate`, and `trades.getChartSeries` — all work end-to-end with the live provider adapter(s). Each procedure already calls the market-data interface (built in E8-T4, E9-T5, E10-T2); this task verifies the full stack from tRPC call through to provider response and confirms graceful degradation in each consumer when the provider is unavailable.

**Acceptance Criteria**

- [ ] `xirr.get` returns a XIRR figure that includes live current prices for open positions (no manually inserted cache item needed)
- [ ] `evaluation.evaluate` fetches a real current price and returns a WIN, LOSS, or BREAKEVEN result
- [ ] `trades.getChartSeries` returns a live historical series with no manually inserted cache item
- [ ] When the provider is unreachable (simulated by pointing the adapter at an invalid URL): `xirr.get` returns XIRR with affected positions in `unpricedPositions`; `evaluation.evaluate` returns `BAD_REQUEST` with a clear message; `getChartSeries` returns the last cached series (or empty series) with a `dataNotice`
- [ ] No provider API key or raw HTTP response body appears in CloudWatch logs

**Demo**
With no manually inserted cache items, call all three procedures against the live provider and confirm each returns a real result. Then set the adapter URL to an invalid endpoint and call all three again — confirm each degrades gracefully without throwing an unhandled error.

---

### E11-T5 — Implement current-price freshness enforcement

| Field      | Value              |
| ---------- | ------------------ |
| Type       | Feature            |
| Priority   | P1                 |
| Status     | To Do              |
| Depends on | E11-T2             |
| Implements | TRD §6.2 · ADR-008 |

**Description**
Enforce the current-price freshness window inside the market-data interface. When `getCurrentPrice` reads a `PRICE#` cache item, it checks the item's `fetchedAt` timestamp against the configured freshness window (default 15 minutes, read from environment config). If the cached price is older than the window, treat it as a miss and fetch fresh from the provider. The freshness window is not hardcoded — it is read from an environment variable so it can be tuned per environment without a code change.

**Acceptance Criteria**

- [ ] A cached price younger than the freshness window is served directly — no provider call is made
- [ ] A cached price older than the freshness window triggers a provider fetch and the cache is updated with the new price and a new `fetchedAt`
- [ ] The freshness window is read from an environment variable (e.g. `PRICE_FRESHNESS_MINUTES`); changing the variable without a code deploy changes the behaviour
- [ ] Unit tests verify: fresh cache → no fetch, stale cache → fetch and update, missing cache → fetch and write
- [ ] The `expiresAt` TTL on the `PRICE#` cache item is set to a value longer than the freshness window so TTL does not expire items before the freshness check can serve them

**Demo**
Set `PRICE_FRESHNESS_MINUTES=1` in the local environment. Fetch a price (cache miss → provider called). Wait 2 minutes. Fetch the same price again — confirm the provider is called a second time (stale). Fetch immediately again — confirm the provider is not called (fresh).

---

## Epic 12 — Private App UI

> **Goal.** All authenticated screens of Beyond Folio are built in Next.js and wired to the backend. A signed-in user can complete every Phase-1 workflow from the browser: import a file, view their trade history, see their XIRR, journal a trade, evaluate a prediction, view the scorecard, and open a price chart.
> **Outcome.** The full product is usable end-to-end from the browser. Every screen calls the real tRPC procedures built in E5–E11. No mock data. Acceptance criteria are behaviour-based — what the user can do and what the system responds with — not design or layout specifications.
> **Note.** All screens are protected routes — an unauthenticated visitor is redirected to the sign-in page (E4-T7). The sign-in page itself was the demo target of E4-T2.

---

### E12-T1 — Build the import flow UI

| Field      | Value                                               |
| ---------- | --------------------------------------------------- |
| Type       | Feature                                             |
| Priority   | P0                                                  |
| Status     | To Do                                               |
| Depends on | E4-T7, E5-T5, E6-T2, E6-T3, E6-T4, E6-T5, E6-T6,    |
|            | E7-T8, E7-T9                                        |
| Implements | TRD §3.3 · FR-I1, FR-I2, FR-I3, FR-I4, FR-I5, FR-I6 |

**Description**
Build the import screen as a protected Next.js page. The screen walks the user through the two-gate import flow: file selection → upload (pre-signed PUT to S3) → detection confirmation → Gate 1 (Proceed to Import) → polling until `PREVIEW_READY` → preview screen → Gate 2 (Confirm) → polling until `COMPLETE` → success summary. The user is notified when the background processing completes so they can navigate away and return.

**Acceptance Criteria**

- [ ] A user can select a CSV or XLSX file and upload it; the file is sent directly to S3 via the pre-signed URL — it does not pass through the Next.js server
- [ ] After upload, the detected broker name and file type are shown (e.g. "Detected: Robinhood"); a "Proceed to Import" button is visible
- [ ] If the file is unrecognised, a hard-stop error message is shown and there is no "Proceed to Import" button
- [ ] If the file is a Fidelity multi-account combined file, the specific rejection message is shown asking for an individual- account export
- [ ] If the same file has already been imported (Layer-1 duplicate), a message is shown with a link to the original import — no "Proceed to Import" button
- [ ] After clicking "Proceed to Import", the UI shows a processing state; the user can navigate away and return without cancelling the import
- [ ] When the import reaches `PREVIEW_READY`, the preview screen shows: count of rows to be imported, count of rows to be skipped, the normalised trade rows, and the skipped rows with reasons
- [ ] After clicking "Confirm", the UI shows a committing state and polls until `COMPLETE`; the success screen shows total records added and skipped
- [ ] If the import reaches `FAILED` at any stage, a clear error message is shown with the failure reason

**Demo**
Complete the full two-gate import flow from the browser with a real Robinhood CSV fixture. Confirm the preview shows the correct counts and rows. Confirm the success screen shows after Confirm. Navigate away after Gate 1 and return — confirm the import continues and the notification appears when the preview is ready.

---

### E12-T2 — Build the unified trade history screen

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Type       | Feature                               |
| Priority   | P0                                    |
| Status     | To Do                                 |
| Depends on | E4-T7, E5-T5, E8-T1, E8-T2, E8-T3     |
| Implements | TRD §3.3 · FR-H1, FR-H2, FR-H3, FR-H4 |

**Description**
Build the trade history screen as a protected Next.js page. Displays a paginated list of all trades across all brokers, newest first. Includes broker and ticker filter controls. Clicking a trade opens its detail view showing all trade attributes and any journal entries.

**Acceptance Criteria**

- [ ] The trade history screen shows all of the user's trades across all brokers, newest first
- [ ] The user can filter the list to a single broker; selecting "Robinhood" shows only Robinhood trades
- [ ] The user can filter by ticker symbol; entering "AAPL" shows only AAPL trades across all brokers
- [ ] The list is paginated; when there are more trades than the page size, a "load more" or next-page control is available and fetches the next page without a full page reload
- [ ] A user with no imported trades sees a prompt to import trades rather than an empty list with no context
- [ ] Clicking a trade opens the trade detail view showing: date, broker, symbol, action, quantity, price, currency, rawAction, and `optionDetails` for options trades
- [ ] The trade detail view shows any existing journal entries for that trade

**Demo**
Import fixtures for two brokers. Open the trade history screen — confirm trades from both brokers are shown, newest first. Filter by broker — confirm only that broker's trades show. Click a trade — confirm the detail view opens with all attributes populated.

---

### E12-T3 — Build the XIRR view

| Field      | Value                              |
| ---------- | ---------------------------------- |
| Type       | Feature                            |
| Priority   | P0                                 |
| Status     | To Do                              |
| Depends on | E4-T7, E5-T5, E8-T4, E8-T6, E11-T4 |
| Implements | TRD §3.3 · FR-X1, FR-X2, FR-X3     |

**Description**
Build the XIRR view as a protected Next.js page or section. Displays the per-currency XIRR figures returned by `xirr.get`. USD and INR are shown as separate, clearly labelled figures. The INR result is always accompanied by the fee-exclusive notice from the backend. Unpriced positions are listed with a note that they could not be valued.

**Acceptance Criteria**

- [ ] The XIRR view shows a separate rate-of-return figure for each currency in which the user has qualifying cashflows
- [ ] USD and INR figures are clearly labelled and never combined into a single blended figure
- [ ] The INR figure is accompanied by the fee-exclusive notice text returned by the backend — the frontend does not construct this notice independently
- [ ] If one or more open positions could not be priced, the affected symbols are listed with a note that their current price was unavailable
- [ ] A user with no cashflows sees a prompt to import trades rather than a zero or error state
- [ ] The view calls `xirr.get` on load; a loading state is shown while the call is in flight

**Demo**
Import a Robinhood fixture with open positions. Open the XIRR view — confirm a USD figure is shown. Import a Zerodha fixture — confirm an INR figure appears alongside the USD figure with the fee-exclusive notice.

---

### E12-T4 — Build the trade journal UI

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Type       | Feature                               |
| Priority   | P0                                    |
| Status     | To Do                                 |
| Depends on | E4-T7, E5-T5, E9-T1, E9-T2, E9-T3     |
| Implements | TRD §3.3 · FR-J1, FR-J2, FR-J3, FR-J4 |

**Description**
Build the journal UI as a section within the trade detail view (E12-T2). A user can add a journal entry to any trade with free-text notes, a prediction (Bullish / Bearish / Neutral), and one or more tags. A trade can have multiple journal entries. Tags are selected from the user's existing tags or a new tag name can be typed and created on-the-fly. If the user has no trades, a prompt to import is shown in place of the journal.

**Acceptance Criteria**

- [ ] From a trade's detail view, a user can add a journal entry with notes, a prediction, and one or more tags
- [ ] A trade can have multiple journal entries; all entries are shown in the trade detail view newest first
- [ ] A user can attach an additional tag to an existing journal entry without editing the notes or prediction
- [ ] Tags can be selected from a list of the user's existing tags; typing a new name and confirming creates the tag and attaches it
- [ ] Prediction is optional — submitting an entry with no prediction selected is allowed
- [ ] If the user has no imported trades, the journal section shows a prompt to import trades first
- [ ] An entry with no notes and no prediction but at least one tag can be saved successfully

**Demo**
Open a trade detail. Add a journal entry with a BULLISH prediction and two tags. Add a second journal entry with different tags. Confirm both entries appear. Attach a third tag to the first entry without re-submitting it. Confirm the tag appears on that entry.

---

### E12-T5 — Build the Evaluate button and prediction outcome display

| Field      | Value                   |
| ---------- | ----------------------- |
| Type       | Feature                 |
| Priority   | P0                      |
| Status     | To Do                   |
| Depends on | E12-T4, E9-T5, E11-T4   |
| Implements | TRD §3.3 · FR-E1, FR-E2 |

**Description**
Add an "Evaluate" button to each journal entry in the trade detail view. Clicking it calls `evaluation.evaluate` for that entry and displays the result (Win / Loss / Breakeven) alongside the price used and the evaluation timestamp. If the price is unavailable, a clear message is shown and no result is displayed. Previously evaluated entries show their last result; clicking Evaluate again updates it.

**Acceptance Criteria**

- [ ] Each journal entry has an "Evaluate" button visible when the entry has a prediction set
- [ ] Clicking "Evaluate" calls the backend and displays the result (Win, Loss, or Breakeven) with the price used and the timestamp
- [ ] While the evaluation call is in flight, the button shows a loading state and cannot be clicked again
- [ ] If the price is unavailable, a message is shown (e.g. "Price data not available — try again later") and no Win/Loss/Breakeven result is displayed
- [ ] An entry without a prediction does not show an "Evaluate" button
- [ ] A previously evaluated entry shows its last result; clicking "Evaluate" again updates the result if the outcome has changed

**Demo**
Open a trade with a BULLISH journal entry. Click "Evaluate" — confirm a Win, Loss, or Breakeven result is shown with the current price. Click "Evaluate" again — confirm the result updates. Remove the price-cache entry (simulating unavailability) and click "Evaluate" — confirm the unavailability message is shown.

---

### E12-T6 — Build the tag scorecard screen

| Field      | Value               |
| ---------- | ------------------- |
| Type       | Feature             |
| Priority   | P0                  |
| Status     | To Do               |
| Depends on | E4-T7, E5-T5, E9-T6 |
| Implements | TRD §3.3 · FR-S2    |

**Description**
Build the tag scorecard screen as a protected Next.js page. Displays all of the user's tags ranked by win rate, each showing wins, losses, breakeven count, and win rate percentage. Clicking a tag shows all journal entries carrying that tag (via `journal.listByTag`) so the user can see which specific predictions drove the record.

**Acceptance Criteria**

- [ ] The scorecard screen shows all tags ranked by win rate descending; a tag with 7W/2L appears above a tag with 4W/5L
- [ ] Each tag row shows the tag name, wins, losses, breakeven, and win rate as a percentage
- [ ] Tags with zero evaluated entries appear at the bottom of the list with a 0% win rate or a "Not yet evaluated" label
- [ ] Clicking a tag shows all journal entries for that tag, each with the trade it belongs to, the prediction, and the evaluation result (if any)
- [ ] A user with no tags sees a prompt to add journal entries and tags rather than an empty list with no context

**Demo**
Create three tags with different win/loss records through evaluations. Open the scorecard screen — confirm the correct ranking order. Click the top-ranked tag — confirm all journal entries for that tag are shown.

---

### E12-T7 — Build the trade price chart screen

| Field      | Value                          |
| ---------- | ------------------------------ |
| Type       | Feature                        |
| Priority   | P1                             |
| Status     | To Do                          |
| Depends on | E12-T2, E10-T2, E10-T4, E11-T4 |
| Implements | TRD §3.3 · FR-H5               |

**Description**
Add a price chart to the equity trade detail view. When the user opens a Stock or ETF trade, a historical price chart is rendered below the trade details with the user's buy and sell transactions marked on it. A range selector (1M / 6M / 1Y) controls the visible window. Non-equity trades show a "Chart not available for this instrument type" message instead.

**Acceptance Criteria**

- [ ] Opening a Stock or ETF trade shows a line chart of the ticker's historical price with the selected range (default 1Y)
- [ ] The chart shows green circle markers for the user's buy transactions and red circle markers for sell transactions for that ticker in the same currency
- [ ] Hovering over a marker shows the transaction type, date, price, and quantity
- [ ] The range selector offers 1M, 6M, and 1Y options; switching range updates the chart immediately without a new API call (the 1Y series is already fetched — 1M/6M are slices)
- [ ] The chart is labelled "as of <date>" where the date is the last completed trading session in the series
- [ ] If price data is temporarily unavailable, a notice is shown below the chart; the markers are still rendered if available
- [ ] Opening an options, index-option, or fund trade shows "Chart not available for this instrument type" in place of the chart

**Demo**
Open a Stock trade detail — confirm the chart renders with the price line and buy/sell markers. Switch between 1M, 6M, and 1Y — confirm the series updates without a loading spinner (cached slice). Open an option trade — confirm the no-chart message is shown.

---

### E12-T8 — Build the import history and status screen

| Field      | Value            |
| ---------- | ---------------- |
| Type       | Feature          |
| Priority   | P1               |
| Status     | To Do            |
| Depends on | E12-T1, E6-T5    |
| Implements | TRD §3.3 · FR-I6 |

**Description**
Build a screen that lists all of the user's past imports with their current status and summary counts. A user can see at a glance how many records each import added and whether it succeeded, is still processing, or failed. Clicking an import in `PREVIEW_READY` status navigates to the preview screen so the user can complete Gate 2.

**Acceptance Criteria**

- [ ] The import history screen lists all past imports for the user with: detected broker, file type, date, status, and counts (records added, records skipped) where available
- [ ] An import in `PROCESSING` status shows a progress indicator and auto-refreshes its status every few seconds
- [ ] An import in `PREVIEW_READY` status shows a "Review & Confirm" link that navigates to the preview screen
- [ ] An import in `FAILED` status shows the failure reason
- [ ] An import in `COMPLETE` status shows the final record counts
- [ ] A user with no past imports sees a prompt to upload their first file

**Demo**
Import two files — one through to `COMPLETE`, one abandoned at `PREVIEW_READY`. Open the import history screen — confirm both appear with the correct statuses. Click the `PREVIEW_READY` import — confirm the preview screen opens and Gate 2 can be completed.

---

### E12-T9 — Implement protected route guard and navigation shell

| Field      | Value                  |
| ---------- | ---------------------- |
| Type       | Enabler                |
| Priority   | P0                     |
| Status     | To Do                  |
| Depends on | E4-T7, E5-T5           |
| Implements | TRD §3.3, §5.7 · FR-P1 |

**Description**
Implement the navigation shell and protected route guard that wraps all authenticated pages. The shell provides consistent navigation between the main sections: Trade History, XIRR, Scorecard, Import, and a user menu with a Sign Out option. The protected route guard (built in E4-T7) redirects unauthenticated visitors to the sign-in page. This task wires all the pages built in E12-T1 through E12-T8 into a coherent navigable app.

**Acceptance Criteria**

- [ ] All authenticated pages are accessible via the navigation shell without a full page reload
- [ ] Clicking Sign Out calls `POST /auth/logout` and redirects the user to the sign-in page
- [ ] A visitor who navigates directly to any protected route URL without a valid session is redirected to sign-in; after signing in they are returned to the page they originally requested
- [ ] The active section is visually indicated in the navigation (e.g. the current page's nav item is highlighted)
- [ ] All tRPC calls from the frontend automatically include the `Authorization: Bearer` header from the in-memory token; a 401 response triggers a silent token refresh before the call is retried (verified from E4-T7)

**Demo**
Sign in and navigate between all main sections using the shell. Sign out — confirm redirect to sign-in. Open a protected URL in a new incognito tab — confirm redirect to sign-in, and after signing in, arrival at the originally requested page.

---

## Epic 13 — Admin, Observability & Testing

> **Goal.** Admins can manage BrokerMapper and SymbolMapping records. The four BrokerMapper definitions are seeded from version control on every deploy. CloudWatch alarms fire on meaningful production signals. The never-log policy is audited. The full test tier — unit, integration, parser fixtures, and smoke tests — runs in CI.
> **Outcome.** The platform is production-ready: the import pipeline cannot run without seeded mappers, the DLQ alarm surfaces stuck imports immediately, and the CI gate prevents a merge that breaks a parser, dedup idempotency, or auth isolation.

---

### E13-T1 — Implement the admin-api BrokerMapper and SymbolMapping procedures

| Field      | Value                                     |
| ---------- | ----------------------------------------- |
| Type       | Feature                                   |
| Priority   | P0                                        |
| Status     | To Do                                     |
| Depends on | E5-T2, E3-T3a, E3-T3b                     |
| Implements | TRD §4.3 · FR-C2 · AP-34, AP-27 · ADR-015 |

**Description**
Implement the `admin-api` tRPC procedures for managing BrokerMapper and SymbolMapping records. All procedures use `adminProcedure` — a non-admin token returns `FORBIDDEN`. BrokerMapper procedures: `admin.mappers.list` (all mappers), `admin.mappers.upsert` (create or update a mapper by `fileType` — idempotent), `admin.mappers.delete` (remove a mapper by `fileType`). SymbolMapping procedure: `admin.symbols.upsert` (create or update a symbol mapping from `(broker, rawSymbol)` to `canonicalSymbol`).

**Acceptance Criteria**

- [ ] `admin.mappers.list` returns all `BrokerMapper` items from the `GLOBAL#BROKERMAPPER` partition
- [ ] `admin.mappers.upsert` creates a new mapper if none exists for the given `fileType`; updates the existing mapper if it does exist; is idempotent (calling twice with the same payload has no effect)
- [ ] `admin.mappers.delete` removes the mapper for the given `fileType`; calling it for a non-existent `fileType` returns `NOT_FOUND`
- [ ] `admin.symbols.upsert` writes a `SymbolMapping` item mapping `(broker, rawSymbol)` to `canonicalSymbol`; calling it twice with a new `canonicalSymbol` updates the existing mapping
- [ ] All four procedures called with a non-admin token return `FORBIDDEN` — a regular user cannot call them
- [ ] All four procedures called without any token return `UNAUTHORIZED`

**Demo**
Sign in as an admin user. Call `admin.mappers.list` — confirm the four seeded mappers are returned. Call `admin.mappers.upsert` with an updated `headerFingerprint` — confirm the change is persisted. Sign in as a regular user and call any admin procedure — confirm `FORBIDDEN`.

---

### E13-T2 — Implement the BrokerMapper seed script

| Field      | Value              |
| ---------- | ------------------ |
| Type       | Enabler            |
| Priority   | P0                 |
| Status     | To Do              |
| Depends on | E13-T1, E3-T3a     |
| Implements | TRD §8.5 · ADR-015 |

**Description**
Implement a version-controlled seed script that writes the four BrokerMapper definitions (`ROBINHOOD_ACTIVITIES`, `FIDELITY_SINGLE_ACC_ACTIVITY`, `ZERODHA_EQUITY`, `ZERODHA_FO`) to the main DynamoDB table using `admin.mappers.upsert` logic (idempotent upsert on `fileType`). The script runs automatically as part of every CDK deploy — on a fresh environment it creates all four mappers; on a re-deploy it updates any that have changed and leaves unchanged ones untouched. The mapper definitions (headerFingerprint, columnMapping) live in the repository as TypeScript source — editing a mapper is a code change that redeploys automatically.

**Acceptance Criteria**

- [ ] Running the seed script against a fresh DynamoDB table creates all four `BrokerMapper` items
- [ ] Running the seed script a second time against the same table makes no changes if the mapper definitions have not changed (idempotent)
- [ ] Updating a mapper definition in the source code and re-running the script updates that mapper in DynamoDB without affecting the other three
- [ ] The seed script is integrated into the CDK deploy pipeline — it runs automatically after `cdk deploy` completes
- [ ] After a fresh deploy to a new environment, the import flow can immediately detect all four broker file types without any manual setup

**Demo**
Deploy to a fresh environment. Without any manual DynamoDB edits, upload a Robinhood CSV and confirm it is detected correctly (the mapper is present from the seed). Update the Robinhood `headerFingerprint` in source, redeploy, and confirm the change is reflected in DynamoDB.

---

### E13-T3 — Document and implement the first-admin bootstrap runbook

| Field      | Value         |
| ---------- | ------------- |
| Type       | Enabler       |
| Priority   | P0            |
| Status     | To Do         |
| Depends on | E4-T2, E13-T1 |
| Implements | TRD §8.5      |

**Description**
Document the one-time manual step required to promote the first admin user. Because roles are app-managed and there is no existing admin to promote the first one, the initial promotion requires a direct DynamoDB edit. The runbook documents exactly: (1) the target person signs in with Google to create their `User` item; (2) an operator sets `role = "admin"` on that user's `USER#<userId> / PROFILE` item using the AWS Console or CLI. The runbook is stored in the repository (e.g. `docs/runbooks/first-admin.md`) so it is version-controlled and findable.

**Acceptance Criteria**

- [ ] A runbook file exists in the repository documenting the exact steps to promote the first admin user
- [ ] The runbook includes the exact DynamoDB `UpdateItem` command (AWS CLI or Console steps) needed to set `role = "admin"`
- [ ] The runbook includes a verification step: after promotion, call an `adminProcedure` (e.g. `admin.mappers.list`) and confirm it returns a result rather than `FORBIDDEN`
- [ ] Following the runbook on a fresh deployed environment results in a working admin user who can call all `adminProcedure` endpoints
- [ ] The runbook notes that subsequent admins are promoted by an existing admin through normal `admin.symbols.upsert` or a similar admin procedure — no further direct DynamoDB edits

**Demo**
Follow the runbook on a fresh deployed environment. Sign in as the promoted user and call `admin.mappers.list` — confirm it succeeds. Sign in as a different (non-admin) user and call the same procedure — confirm `FORBIDDEN`.

---

### E13-T4 — Configure CloudWatch alarms

| Field      | Value        |
| ---------- | ------------ |
| Type       | Enabler      |
| Priority   | P0           |
| Status     | To Do        |
| Depends on | E5-T3, E7-T1 |
| Implements | TRD §9.3     |

**Description**
Define CloudWatch alarms in CDK for the two most important production signals: DLQ depth (an import job has failed its retry budget and is stuck) and Lambda error rate (a function is consistently failing). These alarms are the production smoke detector that compensates for having no staging environment and gate-less CD. Both alarms should notify via an SNS topic (email or other) so an operator is alerted without having to watch dashboards.

**Acceptance Criteria**

- [ ] A CloudWatch alarm is defined in CDK that triggers when the import DLQ depth exceeds 0 (any message in the DLQ is a signal)
- [ ] A CloudWatch alarm is defined in CDK that triggers when any API Lambda's error rate exceeds a defined threshold over a 5-minute window (e.g. more than 5 errors)
- [ ] Both alarms notify an SNS topic; the SNS topic has at least one subscription configured (e.g. an operator email address from CDK context)
- [ ] `cdk synth` produces both alarms and the SNS topic with no errors
- [ ] Manually sending a test message to the DLQ triggers the DLQ depth alarm within the alarm's evaluation period

**Demo**
Deploy the CDK stack. Manually send a test message to the DLQ (LocalStack or real AWS). Confirm the DLQ depth alarm enters ALARM state within the configured evaluation period.

---

### E13-T5 — Audit the never-log policy across all Lambdas

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E5-T3    |
| Implements | TRD §9.2 |

**Description**
Conduct a systematic audit of every log statement across all five Lambda functions (`app-api`, `import-api`, `admin-api`, `auth-api`, `import-worker`) to verify the never-log policy is honoured. The policy: never log raw broker file contents, account numbers, tokens or signing keys, raw PII (email, Google `sub`). Safe to log: opaque `userId`, `importId`, status, `correlationId`, row counts, broker/file type, error codes, durations, canonical symbols. Any violation found is fixed as part of this task.

**Acceptance Criteria**

- [ ] Every log call in all five Lambdas passes only named safe fields to the logger — no raw objects, file buffers, or HTTP request bodies are logged
- [ ] A search across the codebase finds zero instances of `email`, `sub`, `accessToken`, `refreshToken`, `privateKey`, or `clientSecret` being passed to any logging function
- [ ] The OAuth callback handler (E4-T2) does not log the Google ID token, the authorization code, or the user's email
- [ ] The import worker (E7) does not log raw file row contents or account numbers
- [ ] The audit findings are documented (even if no violations are found) — a brief note in the PR or a `docs/` file records that the audit was completed and what was checked

**Demo**
Run the full test suite to confirm no regressions from any logging fixes. Search the codebase for the prohibited field names and confirm zero matches in logging calls. Review CloudWatch logs from an end-to- end import run and confirm no PII or token values are visible.

---

### E13-T6 — Wire the full test tier into CI and verify coverage

| Field      | Value    |
| ---------- | -------- |
| Type       | Enabler  |
| Priority   | P0       |
| Status     | To Do    |
| Depends on | E1-T4    |
| Implements | TRD §9.8 |

**Description**
Ensure the CI pipeline (E1-T4) runs the full balanced test tier on every PR: unit tests (emphasising XIRR, import normalisation, and dedup key helpers), integration tests against DynamoDB Local and LocalStack (emphasising two-layer dedup idempotency, tRPC auth middleware isolation, and import worker flow), parser/normaliser fixture tests for all four broker file types, and a light frontend smoke test suite covering the critical paths (sign-in, import, view trades). Verify that the CI gate blocks a merge when any tier fails.

**Acceptance Criteria**

- [ ] The CI pipeline runs unit tests, integration tests, parser fixture tests, and frontend smoke tests as sequential required steps — a failure at any step fails the pipeline
- [ ] The integration tests include at minimum: two-layer dedup idempotency (reimporting the same fixture adds zero new records), cross-user isolation (a protectedProcedure cannot access another user's data), and the import worker processing a fixture end-to- end through both gates
- [ ] Parser fixture tests exist for all four broker file types and assert specific expected output values (not just "no error")
- [ ] The XIRR unit tests include a known-sequence validation against a spreadsheet-computed reference value
- [ ] A deliberately broken test (e.g. a dedup test that allows duplicates) causes the CI pipeline to fail and blocks the merge
- [ ] The CI pipeline passes cleanly on the `main` branch with all tests green before this task is marked done

**Demo**
Open a PR that introduces a deliberate dedup regression (removes the `attribute_not_exists` condition from a write). Confirm the CI pipeline fails on the integration test for dedup idempotency and the merge is blocked. Revert the regression — confirm CI passes.
