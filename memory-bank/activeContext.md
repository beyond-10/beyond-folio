# Active Context — Beyond Folio

> **What we are working on right now.**
> Update this file every meaningful session.

---

## Current Focus (as of 2026-09-22) — Pre-implementation doc reconciliation (blockers resolved before E1)

> A pre-EPIC consistency pass resolved the two real blockers plus a provider decision and two clarifications, applied across `DYNAMODB_DATA_MODEL.md`, `TRD.md`, `PRD.md`, `PHASE_1_BACKLOG.md`, `docs/SETUP_PREREQUISITES.md`, and the reference memory-bank files (`systemPatterns.md`, `techContext.md`):
>
> 1. **Price-cache key: `exchange` → `currency`.** The cache (and history) items are now keyed `PRICE#<canonicalSymbol>#<currency>` / `PRICEHIST#<canonicalSymbol>#<currency>` (data model §9.2/§9.6, all AP tables, examples, A-7). Reason: broker files reliably carry the account currency but **not** the exchange (only Zerodha names it), so `currency` is the only always-populatable disambiguator — and it is the provider-routing axis. The Trade item is unchanged (it already carries `currency`); the earlier "exchange gap" is dissolved, not patched. Accepted limitation: NSE vs BSE (both INR) collapse to one cache entry (data model OQ-E2) — immaterial to XIRR.
> 2. **Table count → 4:** `BeyondFolio` + Price-cache + Sessions + **Waitlist**. The Waitlist table is documented as **temporary launch-gating scaffolding**, retired at full launch (data model §9.8; TRD §7.1; backlog E2). Data model §6 prose/callouts + forward-map updated.
> 3. **OQ-E RESOLVED — market-data providers chosen:** **INR → Zerodha Kite API** (current + historical NSE/BSE; also the Phase-2 login provider; needs a paid historical-data subscription + user Kite session), **USD → Twelve Data** (over AlphaVantage, whose ~25 req/day free tier throttles the backfill). One interface, routed **by currency**. E11-T1 is now integration-prep, not a selection spike; Setup Tier E updated.
> 4. **Two clarifications:** (a) the deferred _holdings/positions view_ is distinct from the Phase-1 _transient derived holding quantity_ XIRR computes (data model §1.5, PRD FR-X1); (b) admin provisioning — first admin is a manual DynamoDB `role` edit per the E13 runbook, no in-app promotion in Phase 1 (PRD FR-A acceptance criteria); this is an operational step, not a design risk.
>
> **Next actor can begin implementation from E1.** No open blockers remain.

---

## Current Focus (as of 2026-09-17) — Phase-1 backlog COMPLETE & REVIEWED

> **`PHASE_1_BACKLOG.md` (repo root) is done** — all **13 epics / 80 tasks**, final format (Field table → Description → Acceptance-Criteria checkboxes → Demo). A full cross-doc consistency review passed; review fixes applied (added E7-T2b symbol resolution for FR-C1/AP-26; backfilled FR-A4/M1/M2/X3/D1/D2 tags; fixed E7-T7 wording; deleted the stale `PHASE1_BACKLOG.md` stub). **All 33 Phase-1 FRs referenced; AP-1…AP-34 covered.** Infra is just-in-time (Option B). OQ-E carried as an explicit spike (E11-T1). **Next actor can begin implementation from E1.** _(Note: the earlier underscore-less `PHASE1_BACKLOG.md` was a superseded partial; the authoritative file is `PHASE_1_BACKLOG.md`.)_

---

## Prior Focus (as of 2026-09-16) — Phase-1 task backlog AUTHORING IN PROGRESS

> **Now building `PHASE1_BACKLOG.md`** (repo root) — the Phase-1 engineering task backlog, per `HANDOFF-BACKLOG.md`. Method: **epic-by-epic, 2 epics per batch, with a review gate** (author → confirm → user reviews → green-light → next batch; dense epics authored solo).
>
> **Structure agreed:** 13 epics (HANDOFF §4's 11 refined). Task format = ID · Title · User story _(user-facing only)_ / `[Enabler]` tag · Description · References · Dependencies · Acceptance criteria (Given/When/Then where it fits). Hybrid model: **user stories for value, enablers for plumbing.**
>
> **Two agreed changes vs. HANDOFF §4:**
>
> 1. **Public split** — the old "Frontend" epic splits into **E2 Public Site & Waitlist** (moved to the front, ships early for market traction on the already-owned domain) + **E12 Private App UI** (stays late, after its backend). E13 = cross-cutting Admin/Observability/Security/Testing.
> 2. **🆕 NEW SCOPE — waitlist:** a landing page + "Join the waitlist" backed by a small **in-stack DynamoDB `WAITLIST` table** + a validated, rate-limited public endpoint (no third-party vendor; keeps the email list in-account). Flagged as new scope (not in source docs).
>
> **Build order:** E1 (thin infra slice first: CDK + OpenNext hosting + WAITLIST table) → E2 (ship public site) → E3 data layer → E4 auth → E5 platform → E6 import upload/detect → E7 import worker (solo) → E8 history+XIRR (solo) → E9 journal/tags/eval + E10 chart → E11 market-data (OQ-E) + E12 private UI → E13 (solo).
>
> **Progress:** ✅ Batch 1 (E1 T1–T7 thin slice + E2 T1–T4) and ✅ **Batch 2 (E3 Data-Access Layer T1–T5 + E4 Auth & Session T1–T8)** authored. **Infra is just-in-time** (Option B): E1 holds only shared foundations + waitlist slice; E3-T1 provisions the main table+GSIs, E4-T1 provisions the sessions table + SSM OAuth secret + asymmetric JWT keys; S3+SQS/DLQ→E6/E7; price-cache→E11. Awaiting user review before Batch 3 (E5 Shared Backend Platform + E6 Import: Upload & Detection).

---

## Prior Focus (as of 2026-09-07) — TRD COMPLETE → next: Phase-1 task backlog

> **TRD is complete** (`TRD.md` v1.0, all §0–§10 authored) and all four docs (TRD, PRD v1.5, FEATURES, DYNAMODB_DATA_MODEL) are **mutually consistent** (two review rounds done; no pending reconciliations). **The next phase — creating the Phase-1 engineering task backlog — has its own handoff: [`HANDOFF-BACKLOG.md`](../HANDOFF-BACKLOG.md)** (self-sufficient; read it + this memory bank + the four source docs to continue in a fresh chat). Method throughout: decisions LOCKED here first, authored with a per-section review gate.
>
> **PRD-deferred TRD decisions — both RESOLVED:** OQ-F (session/token) → §5 (hybrid JWT + refresh); OQ-E (chart provider/range) → §6 (approach + 1M/6M/1Y locked; only the market-data _vendor_ remains open, tracked in TRD §10.1). Next actor should start the backlog per `HANDOFF-BACKLOG.md` §4.

### ✅ TRD Decision 8 — Non-Functional Requirements (§9) (SETTLED 2026-09-07)

**Observability:** CloudWatch-native — **structured JSON logs + correlation id** (propagated API→SQS→worker) + metrics + **alarms on DLQ depth / error rate** (the "prod smoke detector" for no-staging + gate-less CD) + **AWS X-Ray** tracing. All effectively free at our scale.

**Upload/limits:** **pre-signed S3 direct upload** into `temp/` (browser→S3, bytes never transit Lambda), **5 MB cap** (baked into pre-signed URL, S3-enforced + server-side re-validation); URL issued by a `protectedProcedure` scoped to the user's own key, short expiry. **Refines §2.3/§7.2** (upload is pre-signed direct-to-S3, not a POST through the Lambda). More secure (untrusted bytes stay out of compute) + standard AWS pattern.

**PII-in-logs:** explicit **never-log policy** (raw broker file contents, account numbers, tokens/secrets/signing keys, raw PII like email/`sub`) + **redaction-aware logging helper** + log **named safe fields, not whole objects**. Safe: opaque `userId`, importId/status, correlation id, row counts, broker/file type, error codes, timings, canonical symbols.

**Testing (safety net for gate-less CD):** **balanced tier** — REQUIRED unit + integration + parser-fixtures + light E2E smoke. Emphasis: import pipeline (columnMapping/option-parsers/D1/D11 + fixtures), **dedup idempotency**, **auth isolation**, **XIRR**. Full E2E + coverage thresholds → deferred Phase-2 hardening (§10).

**Performance/scale:** tens of users, 500–2,000 trades/user/yr, <1 GB; serverless + on-demand meets it comfortably. **Not a real-time system; NO numeric SLAs in Phase 1** — relaxed qualitative targets (responsive under normal use, cold-starts acceptable). Formal SLOs/SLAs → deferred (§10).

**Consolidated (already decided, §9 restates + cross-refs):** security/isolation (ADR-002 key rooting, verified `userId` §5.7, identity-based IAM+TLS, no-VPC §7.5, least-priv §7.4); PII-at-rest (SSE-S3 + backend-only §7.2/ADR-016; account-number encryption Phase-2); error handling (typed tRPC errors §4.4 + market-data graceful degradation §6.6); backup/DR (PITR main-only §7.1); input validation (Zod §4.4).

### ✅ TRD Decision 7 — Deployment, Environments & CI/CD (§8) (SETTLED 2026-09-07)

**IaC:** **AWS CDK (TypeScript)** — same language as the whole stack; defines all resources (4 API Lambdas + worker, API Gateway, 3 DynamoDB tables, S3, SQS/DLQ, SSM, IAM). Terraform (HCL, multi-cloud unneeded) + SAM (YAML unwieldy) rejected.

**Next.js hosting:** **OpenNext + CDK** — Next.js as CDK-defined AWS infra (Lambda + CloudFront + S3), same pipeline/account as backend; cheapest to run + cheapest exit doors. **Portability note: avoid host-specific features** (keeps →Vercel ~1–2/10, →Amplify ~2–3/10). Amplify (managed premium) + Vercel (off-AWS, priciest, stickiest lock-in) rejected.

**Environments:** **Local + CI + prod only** (no staging). Local = DynamoDB Local + LocalStack (or shared dev acct); CI = lint/type-check/unit/integration; prod = single live CDK env. Same CDK defs everywhere, only config differs. Accepted tradeoff: OAuth/IAM/S3-lifecycle/SQS first exercised for real in prod; adding staging later ~1/10 via CDK.

**CI/CD:** **GitHub Actions + OIDC** (no long-lived keys); CI gate on every PR (lint→type-check→unit→integration); **fully automated CD to prod on merge — NO manual gate**. Safeguards making gate-less prod-deploy safe: strong required CI gate, branch protection (PR review + green CI), CloudFormation auto-rollback on failed deploy, **idempotent/additive migrations only**, fast revert-to-rollback path. (Raises importance of test coverage → §9.)

**Seed/bootstrap:** **version-controlled BrokerMapper defs seeded via idempotent script on deploy** (upsert `MAPPER#<fileType>`; a mapper update = repo edit + redeploy). **First admin = one-time MANUAL DynamoDB edit** (after user's first sign-in exists, set `role=admin` on their `USER#<userId>` PROFILE item) — documented runbook step, not pipeline code (keeps admin elevation a deliberate privileged act; no chicken-and-egg). Subsequent admins promoted by an existing admin.

### ✅ TRD Decision 6 — Storage & Infrastructure (§7) + Client→API topology (SETTLED 2026-09-07)

**Client→API topology (the one real §1 decision, locked early so §7/§8 build on it): DIRECT.** Browser → API Gateway/tRPC directly (access token as `Bearer` header, per §5.5); Next.js serves pages only, is NOT in the API path. BFF rejected (would reopen §5.5, add a proxy tier/latency/cost, put session state in the Next layer — same concern as the Auth.js rejection). To be written into §1 when authored.

**§7 Decision 1 — Secrets:** **SSM Parameter Store (SecureString)** for secrets (Google OAuth client secret, JWT signing key, market-data API keys) — KMS-encrypted, least-priv IAM, ~free; **plain env vars** for non-secret config (table/bucket names, region, freshness windows). Accessed via a **`getSecret()` helper** (keeps ~1–2/10 path to Secrets Manager if auto-rotation ever needed). Secrets Manager rejected now (auto-rotation low-value for our few rarely-rotated secrets).

**§7 Decision 2 — Temp/staging S3:** **one bucket**, prefix-separated — permanent keep-forever `<userId>/<contentHash>` (ADR-016) + `temp/…` for parked raw file + normalized batch between the two gates. **Lifecycle rule scoped to `temp/` only** auto-expires abandoned temp data; Confirm promotes raw file (in-bucket copy temp→permanent) + deletes temp. **Safeguard: expiry rule must be `temp/`-prefix-scoped, never touch permanent keys.** Separate-buckets option rejected (cost identical; one bucket = fewer resources).

**§7 Decision 3 — PITR:** **main `BeyondFolio` table ONLY**. Price-cache + sessions OFF (ephemeral/rebuildable by design; restoring them meaningless/counterproductive).

**§7 Decision 4 — Networking:** **no VPC.** All stores are IAM-secured managed APIs (DynamoDB/S3/SQS/SSM) + public HTTPS external calls (Google/market data) → identity-based security (IAM+TLS), not network-based. Keeps cold starts fast, avoids NAT-gateway cost. Caveat noted: any future VPC-bound resource (RDS/Redis) = deliberate change pulling compute into a VPC.

**§7 provisioning (recorded, follows locked policy):** DynamoDB all on-demand; TTL on price-cache + sessions `expiresAt`; 3 GSIs referenced from data model (not redefined); S3 SSE-S3/Block-Public-Access/TLS-only/versioning-off/backend-only; SQS + DLQ (bounded `maxReceiveCount`). **3 tables total** — sessions table still ⏳ flagged as ADR-003 data-model reconciliation.

### ✅ TRD Decision 5 — External Integrations (§6) / OQ-E resolved (SETTLED 2026-09-07)

**Provider strategy: abstraction (Option B).** One internal interface — `getCurrentPrice(canonicalSymbol, exchange)` + `getDailySeries(canonicalSymbol, exchange, range)` — with provider selection behind it; app (XIRR/Evaluate/chart) never calls a provider directly. **Number of concrete providers (1 global vs. US+India split) DEFERRED** — abstraction makes it a ~1/10 routing change either way; decide after checking real NSE/BSE coverage. Collapsing 2→1 or splitting 1→2 later are both cheap because the seam exists.

**Market-data needs:** current price (`PRICE#` cache, ~15-min TTL — app-config/env var, per A-5) used inside XIRR + Evaluate; historical daily series (`PRICEHIST#` cache, 1-day-fresh via `fetchedDate==today`).

**OQ-E resolved (range/granularity):** user-selectable **1M / 6M / 1Y**, daily granularity; **>1Y deferred to Phase 2**. Caching: **fetch/cache 1Y once** in the single `PRICEHIST#` item, **slice** for 1M/6M at read time — no extra fetch, no extra cache item, no schema change (consistent with §9.6). Range selector = a read-time window, not a new caching dimension.

**Last-completed-session rule (NEW — fills a doc gap):** the historical series ends at the last _completed_ trading session; **drop any provisional current-day bar**; chart labeled **"as of <date>"**. `fetchedDate` governs _re-fetch timing_ only, NOT which day the series ends on (these were conflated; now separated). Handles weekends/holidays naturally.

**Integrations covered by §6:** market data (in depth) + cross-ref Google OAuth/JWKS (already decided §5, not re-decided) + Phase-2 Zerodha login seam.

**Failure/rate-limit posture:** graceful degradation — on fetch failure serve last cached series (even if a day stale); show "price data temporarily unavailable" notice rather than hard-erroring the trade view; XIRR/Evaluate valuation shown unavailable-with-notice rather than blocking. Cache (lazy + 1-day reuse) already absorbs most upstream load.

**Open sub-questions → §10:** (a) concrete provider(s) selection + India/NSE-BSE coverage check; (b) per-provider current-day-bar behavior (does it return a provisional bar we must strip?).

### ✅ TRD Decision 3 — API Design (§4) + Decision 4 — Auth & Session (§5) (SETTLED 2026-09-07)

**§4 API — style:** **tRPC** for data ops + a plain **HTTP** endpoint for file upload. First-party-only + TS-both-ends + single Next.js client → tRPC's end-to-end type safety is pure gain; its downside (no third-party/non-TS consumers) is irrelevant (API never public). Command actions (Confirm/Evaluate) are natural function calls.

**§4 API — Lambda shape (domain-grouped, 4 API Lambdas + worker):** `app-api` (account, trades, journal, evaluation, symbols/prices) · `import-api` (upload handoff, dedup/detect, status, 2 gates) · `admin-api` (mapper + symbol mgmt) · `auth-api` (sign-in/callback/refresh/logout — **sole** token issuer + **sole** sessions-table access) · `import-worker` (SQS, from §2). Isolates heavy/spiky import + privileged admin + security-critical auth; consolidates everyday ops. Shared business-logic modules; thin entry points. Finer split later = ~2–3/10. _(auth-api added 2026-09-07 for real least-privilege — see §5.4.)_

**§4 API — procedure catalog:** app-api: `account.{get,update,listBrokerAccounts}`, `trades.{list,listByBroker,listByTicker,getChartSeries}`, `journal.{listForTrade,create,get,attachTags,listByTag}`, `tags.{list,create}`, `evaluation.{evaluate,getScorecard,listRanked}`, `xirr.get`. import-api: `import.{upload(HTTP),proceed,getStatus,getPreview,confirm}`. admin-api: `admin.mappers.{list,upsert,delete}`, `admin.symbols.upsert`. **Current price embedded** in `evaluation.evaluate` + `trades.getChartSeries` (no standalone `prices.get`). Internal-only (not procedures): `resolveSymbol` (AP-26), current-price cache reads, first-login provisioning + login resolution. Naming per tRPC convention.

**§4 API — conventions:** cursor pagination (`LastEvaluatedKey`, `{items,nextCursor}`, ~50 default); typed tRPC error codes + safe messages; Zod on every procedure; import status via **polling `import.getStatus`** (load scales with concurrent imports; websockets far-future only).

**§5 Auth — (ADR-013 locked inputs unchanged):** self-managed OAuth 2.0, Google P1, `sub`→`userId` via AuthIdentity, first-login provisioning, app-managed roles.

- **Session model (OQ-F): HYBRID** — short-lived app-signed JWT access token (signature-verified, no lookup) + longer-lived refresh token (stored, revocable).
- **Refresh-token store: dedicated DynamoDB sessions table** — native TTL, serverless, hit only on refresh/logout, least-privilege IAM (only auth path). **✅ RECONCILED into data model (2026-09-07):** ADR-003 extended (sessions = 2nd purposeful exception), §6.1 now "three tables", §6.5 forward-map row added, new §9.7 sessions subsection (TRD-owned), §3/§6 intros + section index updated. Redis/ElastiCache rejected (always-on/VPC/non-serverless; store hit only on refresh, not per request).
- **Browser token storage:** refresh token = `HttpOnly`+`Secure`+`SameSite=Lax`, `Path`-scoped to refresh endpoint (XSS-proof, HTTPS-only, CSRF-protected, avoids logged-out-on-arrival friction). Access token = in-memory `Authorization: Bearer`, re-established silently via refresh on reload.
- **Libraries:** `openid-client` (Google OIDC flow: PKCE/state/nonce/JWKS) + `jose` (sign/verify our JWTs). Backend-owned; no hand-rolled crypto. Passport (server-session-centric) + Auth.js/NextAuth (Next-centric, competes for identity ownership) rejected as misaligned with the standalone tRPC/Lambda backend.
- **Enforcement (= §4 item 2): tRPC middleware + 3 procedure types** — verify JWT (via **public key**, asymmetric RS256/ES256; runs in all 4 API Lambdas) → inject **verified** `userId`+`role` (never client input) → `publicProcedure` (auth-api sign-in/refresh/logout + health) / `protectedProcedure` (logged-in, scoped to self; default) / `adminProcedure` (role===admin; admin-api). **`auth-api` is the sole token issuer** (holds the private signing key) **+ sole sessions-table accessor**. Cross-user isolation structural (verified `userId` + `USER#<userId>` rooting, ADR-002). Logout = delete session row; log-out-everywhere = delete all the user's session rows.

### ✅ TRD Decision 2 — Technology Stack (SETTLED 2026-09-07)

**Backend language: TypeScript (Node.js on Lambda).** Frontend is fixed as TypeScript, so this unifies the stack — one language/toolchain, shared types end-to-end, the strongest single-table DynamoDB tooling (TS-native), favorable cold starts, mature OAuth/JWKS/CSV/XLSX ecosystem. **Python escape-hatch (deferred, not adopted):** isolate a _single_ feature — realistically XIRR (`pyxirr`/numpy) or heavy CSV/XLSX parsing (pandas) — in a dedicated Python Lambda **only if** the TS implementation proves inadequate; the polyglot cost (two toolchains, a type seam at the boundary, duplicated domain models) is not paid up front.

**Data-access layer: ElectroDB (main `BeyondFolio` table) + raw AWS SDK v3 (price-cache table).** The main table is a complex single-table design (~11 overloaded entity types, 3 GSIs) — ElectroDB defines each entity once and builds/parses keys + GSI queries, encoding AP-1…AP-34 as typed queries. The price-cache table is trivial (2 item types: `PRICE#…` + `PRICEHIST#…`, TTL, no GSI) → direct SDK. "Library where it earns its place, SDK where it doesn't" (ADR-003 spirit).

**Frontend: a single Next.js app** for BOTH public (SEO-discoverable, SSR/SSG) and private (authenticated) pages. Chosen over React+Vite SPA and over a two-app split (Vite SPA + separate Next.js public site): public pages are planned from the start, and one Next.js app serves both jobs with one framework/toolchain/shared-UI, avoiding UI duplication and the un-retrofittable-SEO trap. Still 100% TypeScript. **Caveat:** Next.js needs a rendering host (AWS Amplify Hosting or Next-on-Lambda) — slightly more than static S3, minor at our scale.

**Cross-ref:** §3.3 (Next.js/TS) interacts with §4 (API style) — a future tRPC choice pairs naturally with this stack; flag when authoring §4.

### ⏳ Data model confirmation (during Decision 2)

Verified against `DYNAMODB_DATA_MODEL.md` §6.1/§9.6: the model is **exactly 2 tables**. The FR-H5 historical-chart feature uses a **`PriceHistory` item** (`PRICEHIST#…`) that deliberately lives **in the existing auxiliary price-cache table** (same lifecycle, distinct prefix + `entityType`), **not a third table** (§9.6, ADR-003/008). Data model is complete on this point; only OQ-E (provider/range) remains, and it needs no schema/table change.

### ✅ TRD Decision 1 — Runtime + Import Pipeline (SETTLED 2026-09-07)

**Runtime shape: serverless** (AWS Lambda + API Gateway). Rationale: Beyond Folio's small, bursty, mostly-idle, AWS-native profile (DynamoDB on-demand + S3 already committed); scale-to-zero cost fit; cold starts a non-issue at relaxed latency needs. **Migration note:** serverless→always-on-server later is a contained ~4/10 change _if_ the import/business logic is kept invocation-agnostic (see TRD principle below); starting serverless keeps the cheaper migration direction ahead of us.

**Import execution: asynchronous background job via SQS + dead-letter queue (DLQ).** Chosen over synchronous (survives user disconnect / worst-case ~5,000-row imports) and over lighter async variants (fire-and-forget async invoke; DynamoDB Streams-as-trigger). Streams was seriously considered but rejected after establishing that (1) retry-until-success is a property of the Lambda _event source mapping_, not Streams itself, and needs an `OnFailure` destination (a queue) for terminal failures — a queue exists either way; (2) the `COMPLETE` status-update write would re-fire the handler unless filtered; (3) per-shard poison-record blocking + cross-user shard-contamination must be _verified_, not assumed. Given (1)'s convergence, an explicit SQS queue as the _primary_ trigger is the more honest, conventional design.

**Reliability model (causal order matters):** idempotent two-layer dedup (ADR-005; deterministic `tradeId`/`cashflowId` + `attribute_not_exists`) is the **load-bearing piece** — it makes _any_ retry safe. The queue merely supplies the retry. DLQ + bounded `maxReceiveCount` catch poison jobs → mark `ImportedFile` `FAILED` (no invisible stuck jobs).

**Import pipeline — richer TWO-GATE shape (async normalize, parked normalized batch):**

```
1. User clicks Upload → uploads CSV/XLSX
2. Layer-1 file-hash dedup (SHA-256)  → duplicate file: STOP + message
3. Detect broker + file type (header fingerprint) → no match: HARD STOP ("contact support")
   → match: show "detected <broker>", "uploaded successfully", + [Proceed to Import]
4. Raw file written to TEMP S3 (parked; lifecycle-expired if abandoned)

── GATE 1: user clicks [Proceed to Import] ──

5. ASYNC (SQS+worker+DLQ; user may switch tabs / disconnect):
     • find/create account (find-or-create by (userId, broker))
     • minimal parse + Layer-2 dedup → classify new / duplicate / unsupported
     • FULL normalize the new+supported rows
     • PARK the NORMALIZED batch in temp S3 (one object keyed to the import)
     • ImportedFile.status → PREVIEW_READY
6. In-app notification: "file processed — ready for your confirmation"

── (user navigates to job) → preview: counts + normalized imported rows + skipped/unsupported rows ──

── GATE 2: user clicks [Confirm] ──

8. WRITE (async): read parked normalized batch →
     (a) promote raw file temp → permanent S3 <userId>/<contentHash>  (ADR-016)
     (b) write ImportedFile (s3Key)
     (c) write Trades/Cashflows (attribute_not_exists — Layer-2 re-enforced)
     • delete parked normalized batch + temp raw file
     • ImportedFile.status → COMPLETE
```

**Key properties:**

- **Two gates.** Gate 1 (Proceed to Import) starts async processing; Gate 2 (Confirm) is the human checkpoint on the _interpreted (normalized) result_ before any DB write — the deliberate reason for the richer shape.
- **Async placement = the heavy phases only** (Stage 5 normalize after Gate 1; Stage 7 write after Gate 2). Cheap pre-Gate-1 work (upload, Layer-1, detect) is synchronous.
- **Parking = temp S3 holds two things** across the gates: the **raw file** (from upload) and the **normalized batch** (from Stage 5). Both promoted/consumed + cleaned up on Confirm; both lifecycle-expired if abandoned. Reuses the temp→promote mechanism — no new store class. (Stage 5 also re-runs the cheap Layer-2 re-check so skipped/duplicate rows are excluded from the write — doubles as the mandated write-time `attribute_not_exists` re-enforcement.)
- **`ImportedFile` status spine:** `UPLOADED → PROCESSING → PREVIEW_READY → COMMITTING → COMPLETE` (+ `FAILED` / `CANCELLED`), polled by the UI and driving the notification. **Reconciles the §10.8 double-write:** `ImportedFile` is **created once at upload** (stage 1 — this is the Layer-1 `attribute_not_exists` gate) and **updated** through its lifecycle; stage 7b becomes an _update_ that attaches `s3Key`, not a fresh create.

**TRD principle to record in `TRD.md`:** the import pipeline is an **invocation-agnostic standalone function** (plain inputs → work → update `ImportedFile` status); the API handler and the SQS worker are thin wrappers. Keeps the mechanism swappable and preserves the cheap serverless→server migration path.

**Downstream consequences (honor in later sections):**

- Import API returns "started" + UI polls status → a small **import-status UX** addition needed in PRD/FEATURES (flag when authoring the import section).
- **Sessions (OQ-F):** serverless has no per-request memory → session will be a **self-contained signed token** or a **shared session store**, not in-process memory. Settle in the auth decision.
- Infra added: SQS queue(s) + DLQ(s) (1 shared queue with a job-type field vs. 2 queues = implementation detail), worker function(s), temp-S3 area + lifecycle rules.

### ✅ Fidelity single-account clarification (RECONCILED 2026-09-07)

User clarified: Phase 1 accepts **only a single-account Fidelity file**; a **multi-account (combined) file is rejected** (hard-stop with a tailored message asking for an individual-account export) — NOT silently "consolidated." The prior "consolidated" wording overstated it. Reconciled across all docs:

- **Mapper renamed** `FIDELITY_COMBINED` → **`FIDELITY_SINGLE_ACC_ACTIVITY`** (data model §7.13/§11.15, TRD §8.5, projectbrief, progress).
- **"consolidated" mis-wording fixed** → single-account-accepted / multi-account-not-supported (data model §7.2/§11.1/§11.3, PRD FR-I2 + acceptance + FR-M1, FEATURES §5.10, productContext, TRD §10.3).
- **Tailored multi-account warning added** (data model §10.8 stage 2: detect `Account`/`Account Number` cols → specific "upload an individual-account file" message; PRD FR-I2; FEATURES §5.1). Extends the D9-Q5 recognized-but-changed / wholly-unrecognized distinction with a third case.
- Verified: no `FIDELITY_COMBINED` remains anywhere; residual "consolidat*" hits are unrelated (tables/decisions/value-prop).

### ✅ Source-doc reconciliation — DONE (2026-09-07) (was: pending; touched LOCKED decisions, applied with user approval)

All import-flow refinements have been written back into the source docs (Item 1 = sessions table; Item 2 = import pipeline):

- **L5 / §10.8:** preview now = **counts + normalized imported rows + skipped/unsupported rows** (dropped the ~20-row raw sample). ✅ data model §10.8 + L5 note.
- **L4 / §10.8 order:** full normalization moved **after Gate 1 (async)**; write **after Gate 2**; single confirmation → **two gates**. ✅ data model §10.8 + L4 note.
- **D13:** one confirmation → **two gates** (Proceed + Confirm). ✅ PRD FR-I4, FEATURES §5.1, D13 note.
- **ADR-016 / §7.3:** **temp-upload → promote-on-confirm** + normalized-batch parking + pre-signed direct-to-S3. ✅ data model ADR-016 + §7.3 + D14 note.
- **§10.8 stage 1 vs 7b:** `ImportedFile` **created-at-upload + updated-through-lifecycle** (`status` attribute added to §7.3). ✅
- **Sessions table (Item 1):** reconciled vs ADR-003 (§6.1 "three tables", §6.5, new §9.7). ✅

### Prior Focus (as of 2026-09-06) — Import-Mechanism Decisions WRITTEN INTO SOURCE DOCS (COMPLETE)

> ✅ **DONE — all 14 import decisions (D1–D14) are locked AND now written into the source-of-truth docs** (`DYNAMODB_DATA_MODEL.md`, `PRD.md`, `FEATURES.md`) across the 9-batch source-doc edit (see `HANDOFF-DOCS-EDIT.md` §3.5 tracker + `progress.md` Batch-1–89 notes). Highlights now in the docs: **ADR-015** (admin-managed BrokerMapper + normalization) & **ADR-016** (raw-file storage in S3); BrokerMapper entity/item (§3/§7.13); GSI1 reframed **"by broker"** (`GSI1PK = USER#<userId>#BROKER#<broker>`); `Account`→**`BrokerAccount`** rename (data model); Trade/Cashflow new attributes + **10-value `cashflowType`** (D4); `ImportedFile.s3Key`; §10.8/§10.9 import & normalization pipeline; §11.15 worked example; §13 OQ-A narrowed / OQ-J resolved / OQ-K–OQ-T added; PRD FR-I2/FR-I4/FR-H2/FR-M1 + FEATURES §5.1/§5.10. This section below is the durable decision record (the "why"); the docs are now the territory. **No open import work remains.**
>
> **⤷ UPDATE (2026-09-07):** the TRD phase later **refined the import flow** (two-gate async pipeline; preview shows normalized rows + skipped rows; `ImportedFile.status` lifecycle; temp-S3 → promote-on-confirm; pre-signed direct-to-S3 upload w/ 5 MB cap). These refinements have been **reconciled back into the source docs** (data model §10.8/§7.3/ADR-015/ADR-016; L4/L5/D13/D14 notes above; PRD FR-I4; FEATURES §5.1). See TRD §2.3–§2.6, §9.5.

### ✅ LOCKED decisions (do not re-open)

- **L1 — `BrokerMapper` is admin-managed.** A new **shared** entity holding how to read one broker file (columnMapping + interpretation rules + `headerFingerprint` + `version`). **Not** the User profile. Create/modify/delete by **admin only**; ordinary users never edit it. Global/admin-owned, same precedent as `GLOBAL#SYMBOLMAP` (ADR-012). Admin **pre-seeds all 4 mappers before launch**.
- **L2 — Auto-detect broker AND file type from the header fingerprint** — no broker dropdown, no Zerodha EQ/FO dropdown. `headerFingerprint` = ordered, normalized (lowercased/trimmed) header column names joined (optionally hashed), stored on the mapper. FO vs EQ auto-resolves (FO header has `expiry_date`). Requires admin to keep fingerprints unique (natural — real headers differ).
- **L3 — Header mismatch = HARD STOP** ("this file doesn't match our internal mappers; contact support"). Because users can't edit mappers, a broker format change is an **admin** action (admin updates mapper → user retries).
- **L4 — Pipeline order:** Layer-1 file-hash dedup → minimal parse (identity fields only) → Layer-2 record dedup → **FULL normalize on NEW rows only** → preview → confirm → write (Layer-2 re-enforced on write via `attribute_not_exists`). Rationale: never fully normalize a duplicate file/row (user's optimization). **⤷ REFINED by TRD Decision 1 (§2.3, 2026-09-07):** the flow is now **two gates around async work** — upload (creates `ImportedFile status=UPLOADED` + stages raw file to temp S3) → **Gate 1 (Proceed to Import)** → async find/create-account + minimal-parse + Layer-2 + **FULL normalize** + park normalized batch (`PREVIEW_READY`) → **preview** → **Gate 2 (Confirm)** → async write + promote temp→permanent S3 (`COMPLETE`). Normalize now runs **after Gate 1** (async), write **after Gate 2**; the cheap-first / normalize-new-only rationale is unchanged. Written into data model §10.8.
- **L5 — Preview = counts + the normalized rows to be imported + skipped/unsupported rows.** Read-only, **no edit button** in Phase 1. **⤷ REFINED by TRD (§2.3, 2026-09-07):** originally "sample (first ~20 rows) + counts"; the sample is **replaced** by showing the actual **normalized rows that will be imported** plus the **skipped/unsupported rows** — the interpreted result the user confirms against (a raw sample only showed what the user already gave us). Written into data model §10.8.
- **L6 — "Skipped" = ROWS** (unsupported transaction types), not columns.
- **L7 — Fee handling (verified against files):** Fidelity trade `Amount` is **net of commission+fees** (arithmetic confirmed, e.g. option sale `6.3×100 − 0.65 − 0.04 = 629.31`) → use net `Amount` as cash leg; keep commission/fees as **display metadata only** (do NOT double-count in XIRR). Robinhood trades are **fee-free** (`Amount ≈ qty×price`); its **`GOLD`/`AFEE`/`DTAX` rows become their own FEE cashflows**. Zerodha = no fees in file (OQ-I). **→ This resolves OQ-J.**
- **L8 — Preserve `rawAction`** (raw verb/code string) alongside existing `rawSymbol`, for audit / mismatch comparison.
- **L9 — OQ-M approved** — mapper correction is **forward-only** in Phase 1; retroactive re-import of already-imported wrong rows is **deferred to Phase 2** (needs raw-file storage + the "undo an import" engine, PRD §6 O6).

### ✅ D1 — TRANSACTION-TYPE CATALOGUE — LOCKED (2026-08-19)

> Maps every real broker label → our normalized category (or SKIP / EVENT). Drives the normalizer AND the "skipped rows" count. Settled broker-by-broker against the real dummy files (incl. a richer Fidelity file with dividends/royalty/RSU rows).

**Normalized category set (D1 working list — see D4 for the FINAL persisted enum):** `BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND, INCOME, FEE, ROYALTY, ADJUSTMENT` + **EVENT** (non-cash position events → handled in D3) + **SKIP** (not imported). ⚠️ **D4 supersedes this for the stored `cashflowType` enum** — the final 10-value enum adds a **distinct `INTEREST`** (`BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, INCOME, FEE, ROYALTY, ADJUSTMENT`); the D1 list above omitted INTEREST (it folded interest into INCOME). Every Cashflow also carries **`includeInXIRR`** (true/false) and preserves **`rawAction`** (raw verb/code string).

**Robinhood (`Trans Code`):**

- `Buy, BTO, BTC` → **BUY** ✅XIRR · `Sell, STO, STC` → **SELL** ✅
- `ACH` (incl. REVERSAL) → **DEPOSIT** if +, **WITHDRAWAL** if − ✅
- `CDIV, MDIV, LCAP, SCAP` → **DIVIDEND** ✅
- `INT, SLIP, GDBP` → **INCOME** ✅
- `GOLD, AFEE, DTAX` → **FEE** ✅
- `OASGN, OEXP, MRGS, SPL, REC` → **EVENT** (→ D3)
- `FUTSWP` → **SKIP**

**Fidelity (free-text `Action`):**

- `YOU BOUGHT/SOLD …` (stock/option/fund; incl. OPENING/CLOSING, ASSIGNED-shares, and noisy prefixes EX-DIV / AVERAGE PRICE / AGENCY CROSS / VSP…) → **BUY / SELL** ✅ (ignore prefix text; keep in `rawAction`)
- `ASSIGNED …` / `EXPIRED …` (option leg, amount 0) → **EVENT** (→ D3)
- `DIVIDEND RECEIVED <security>` **and** `DIVIDEND RECEIVED … SPAXX` → **DIVIDEND** ✅ _(SPAXX money-market dividend mapped to DIVIDEND per file's own wording — "Option A")_
- `PURCHASE/REDEMPTION … SPAXX` (money-market sweeps) → stored, **`includeInXIRR=false`** ❌ (internal cash movement, not a Trade)
- `ROYALTY TR PYMT …` → **ROYALTY** ✅
- `JOURNALED RSU <tax>` (negative, no symbol) → **ADJUSTMENT**, **`includeInXIRR=false`** ❌ (OQ-N)
- `Electronic Funds Transfer Received` (empty symbol, Amount +) → **DEPOSIT**, `includeInXIRR=true` ✅ _(external cashflow — found in the richer `fidelity-2025.csv`; corrects the earlier "Fidelity has no deposit/withdrawal rows" assumption)_
- `Electronic Funds Transfer Paid` (empty symbol, Amount −) → **WITHDRAWAL**, `includeInXIRR=true` ✅ _(external cashflow; Cashflow-only, no Trade — empty Symbol)_
- `YOU BOUGHT RSU#### …` (amount 0) → **BUY @ price 0** ✅ (shares into holdings, no cash effect) (OQ-N)

**Zerodha (EQ + FO, `trade_type`):** `buy` → **BUY** ✅ · `sell` → **SELL** ✅. (No dividends/fees/deposits/events in tradebooks — consistent with OQ-I.)

**Structural rules that emerged from D1 (carry into doc edits):**

1. **`includeInXIRR` flag** on every Cashflow — false for SPAXX sweeps & RSU-tax rows; true otherwise. Rationale: XIRR only counts money crossing the pocket↔portfolio boundary; SPAXX sweeps are internal cash-form changes (cash ↔ money-market) that never cross it, so including them injects phantom cashflows. SPAXX **interest** (`DIVIDEND RECEIVED SPAXX`) IS a real return and IS counted.
2. **SPAXX sweeps = Cashflow-only** — never create a Trade, not in holdings/history; **stored but NOT surfaced in Phase-1 UI (Option A)**; excluded from XIRR. (Also: no non-trade cashflow — deposit/withdrawal/dividend/fee/income — appears in Trade History; that view is buys/sells only.)
3. **`rawAction` preserved** on every record (audit + future re-labelling).
4. **EVENT** rows catalogued here; their _handling_ (assignment/expiration/merger/split/reclass → holdings) is decision **D3**. Assignment appears as TWO rows: the amount-0 option leg (EVENT) + the real-cash share row (normal BUY/SELL) — confirmed split.
5. **Option Open/Close flag** captured on option BUY/SELL (RH BTO/STO/BTC/STC; Fidelity OPENING/CLOSING) — useful for D3 holdings netting.
6. **OQ-N (new)** — RSU vesting mechanics: JOURNALED-RSU tax rows excluded from XIRR (users say employer already withheld); zero-cost RSU share-ins as BUY@0; cost-basis nuance (BUY@0 → $0 basis inflates Phase-2 realized P/L). Verify against a real vesting event; flip `includeInXIRR` if assumption wrong — no re-modeling needed.

### ✅ D2 — LAYER-2 DEDUP KEY (per-broker fingerprint) — LOCKED (2026-08-21)

> **Core feature — safe re-upload / no-duplicate imports (FEATURES §5.2, ADR-005).** The blocker: the old deterministic key `tradeId = hash(account+canonicalSymbol+datetime+side+qty+price)` (§7.4) and `cashflowId = hash(account+type+currency+date+amount)` (§10.1) is **NOT unique for Robinhood/Fidelity**, because those files give **date-only (no clock time)** and **no broker trade-id** — so two genuinely-distinct but identical-looking same-day rows compute the SAME key and the second real row is **silently dropped**. This is common for options. Real proof in the files: two identical `RIVN … Call $14.00 STO 1 $0.90 $89.94` (02/07/25); two identical `BRK.B Sell 2 @ $517.27` (03/03/25); two identical `$2,000 ACH Deposit` (03/03/25); two identical Fidelity `YOU SOLD ASSIGNED CALLS … AMZN −100 @ $250` (08/03/26). Zerodha is unaffected — it carries a real unique `trade_id`.

**Two competing requirements the fingerprint must satisfy at once:**

1. **Re-upload safety (idempotency):** the SAME trade appearing in two different files must produce the SAME id → so the true duplicate is skipped.
2. **Distinctness:** two GENUINELY-DIFFERENT trades that look identical must produce DIFFERENT ids → so a real trade is never dropped.

**LOCKED fingerprint recipe — per broker** (applies to **BOTH** `tradeId` for Trades AND `cashflowId` for Cashflows — a buy/sell writes both per ADR-011; deposits/dividends/fees/income are cashflow-only; the "identical same-day" risk exists for cashflows too, e.g. the two `$2,000 ACH Deposit` rows):

| Broker        | Distinguisher folded into the identity                      | Trade fingerprint                                      | Cashflow fingerprint                                 | Use-Case-7 residual               |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- | --------------------------------- |
| **Zerodha**   | broker **`trade_id`** (unique, stable, cross-file safe)     | `account\|brokerTradeId`                               | (tradebooks are trade-only; use id where present)    | ❌ none — fully safe              |
| **Fidelity**  | **`Cash Balance`** column (running balance differs per row) | `account\|symbol\|date\|side\|qty\|price\|cashBalance` | `account\|type\|currency\|date\|amount\|cashBalance` | ❌ none — balance differs per row |
| **Robinhood** | **occurrence-index `#N`** (no id, no balance available)     | `account\|symbol\|date\|side\|qty\|price\|#N`          | `account\|type\|currency\|date\|amount\|#N`          | ⚠️ narrow (revised OQ-A)          |

**The occurrence-index mechanism (Robinhood):**

- **Fingerprint** = ALL identity fields glued into one string + an occurrence suffix `#N`, then hashed. `#N` = "which copy am I among rows in THIS file with the same full identity" (count within the identical group, 1,2,3…) — **NOT** the file line number.
- **Uniform rule for every row:** a row with no twin is simply `#1` (a group of size 1). The `#N` is ALWAYS appended, not only when a twin exists. Implementation: single top-to-bottom pass keeping a per-identity tally.
- **Import rule:** build fingerprint → conditional write with `attribute_not_exists` (ADR-005) → exists ⇒ skip (duplicate), absent ⇒ insert. O(rows); no read-all scan.
- **Worked cases proven:** (1) all-unique → all `#1`, all import; (2) duplicates within one file → `#1/#2/#3`, all kept (THE FIX); (3) exact re-upload → same fingerprints → all skipped (idempotent); (4) overlapping windows → only genuinely-new rows import; (5) narrower window showing one copy → recomputes `#1` → collides with stored `#1` → skipped (NOT re-imported); (6) genuinely more copies later (M>N) → extra copies get `#(N+1)…` → imported.

**Revised OQ-A (the ONE residual failure — Robinhood only, much smaller than before):** two genuinely-DIFFERENT identical-looking same-day rows that are **never present together in a single uploaded file** (e.g. split across "last-30-trades" filtered exports) — the second gets `#1`, collides, and is missed. **Any single file that lists both captures both** (they become `#1/#2`). Normal overlapping **date-range** exports naturally avoid this (a date range always includes all of that day's rows). **Fidelity (Cash Balance) and Zerodha (trade_id) are fully immune.** This replaces the old OQ-A ("accepted rare limitation that ALWAYS drops the same-day twin, even within one file").

**New stored attributes to support this (for doc edits):** `brokerTradeId` (Zerodha), `cashBalance` (Fidelity — also generally useful), `occurrence` (Robinhood), captured at import on both Trade and Cashflow. Revises **§7.4** (tradeId), **§10.1** (cashflowId / two-layer dedup), and rewrites **OQ-A** in §13.1.1. _(Small caveat noted: Fidelity `Cash Balance` folded into the key means a broker reformat/omission of that column would change keys — acceptable; it's a stable column.)_

### ✅ D3 — NON-TRADE POSITION EVENTS — LOCKED (2026-08-27)

> The EVENT bucket from D1 (`ASSIGNED/EXPIRED` — Fidelity; `OASGN/OEXP/MRGS/SPL/REC` — Robinhood; Zerodha has none). These rows carry little/no cash, change what you hold, and are stated as terse codes / free-text. D1 parked them; D3 decides what the normalizer does with them. Grounded in the real dummy files.

**Chosen approach — HYBRID "label now, interpret in Phase 2" (Approach C):**

1. **Stamp `eventType` at import** on the Trade item — enum **`ASSIGNMENT, EXERCISE, EXPIRATION, MERGER, SPLIT, RECLASS`** (extensible), populated from D1's EVENT classification (the mapper already knows the intent, so Phase 2 never re-parses free-text).
2. **EVENT rows are INERT in Phase 1:** excluded from XIRR **structurally** — an EVENT is a **Trade item with no Cashflow**, so it never appears in the per-currency cashflow timeline; and it is **not** netted into derived holdings (identified by `eventType`); `rawAction` preserved. _(It does NOT carry `includeInXIRR` — that boolean is a **Cashflow-only** attribute per D4; an EVENT Trade has no Cashflow to flag.)_ All real cash/share impact continues to flow through the **paired real-cash `BUY/SELL` rows** (D1 lock — the amount-0 option leg is the EVENT; the paired share row is a normal trade → **no double-count**, no data loss).
3. **UI — EVENT rows ARE STORED AND SHOWN in Trade History** as **non-cash informational rows** (clearly marked, e.g. an "Event" badge + `eventType`; no cash/price semantics). _This refines D1 structural rule #2_ — Trade History is buys/sells **plus** these distinctly-styled informational EVENT rows (distinct from the SPAXX-sweep "Option A" hidden treatment, which stays hidden).
4. **Interpretation DEFERRED to Phase 2** — applying split ratios, merger symbol-swaps, expiration-closes-position, assignment-closes-option → the Phase-2 **execution-ordered position tracker** (ties to **OQ-B**). Phase 1 has no holdings/P&L view, so nothing consumes interpretation yet.

**Why C (not SKIP / raw-only / interpret-now):** SKIP = permanent data loss under forward-only re-import (L9/OQ-M); raw-only forces Phase 2 to re-derive intent from free-text; interpret-now (Approach D) drags the entire Phase-2 position engine (split math, merger `S`-suffix swaps, option open/close = OQ-B) into Phase 1 for **zero** Phase-1 benefit. C clears the blocker at minimum cost/risk.

**Rejected alternatives considered:** A (SKIP entirely), B (record raw, no label), D (full interpretation + holdings mutation now).

**Worked cases (from the files):**

- Fidelity assignment (05/18/26 AMZN): `ASSIGNED … CALL … MAY 15 26 $250` (Qty 1, Amount 0) → Trade `eventType=ASSIGNMENT`, inert; paired `YOU SOLD ASSIGNED CALLS … AMZN −100 @ 250` (Amount 24999.48) → normal SELL, carries the cash/shares.
- Robinhood split (06/10/24 NVDA): `NVDA … SPL 0.4434` → Trade `eventType=SPLIT`, inert (holdings NOT multiplied in P1; ratio applied by the P2 tracker).
- Robinhood merger (09/10/24 SIRI): `MRGS 31.4358` out / `314.3584S` in (note `S`-suffix qty → D12) → `eventType=MERGER`, inert.

**New attribute for doc edits:** `eventType` on Trade (confirms HANDOFF §9 candidate; enum above). Populated only for EVENT-classified rows; absent on ordinary buys/sells.

**New open question — OQ-O:** merger/split _interpretation_ needs data the files don't fully give (`SPL` gives top-up qty `0.4434`, not the ratio; `MRGS` gives in/out quantities with an `S`-suffix). The Phase-2 tracker must infer ratios / handle symbol-swaps — verify against real corporate-action examples.

### ✅ D4 — CASHFLOW TYPE ENUM + XIRR MEMBERSHIP — LOCKED (2026-08-27)

> D1 expanded the _categories_ but the persisted `cashflowType` enum (§7.5, 6 values) never caught up, and per-category XIRR membership for the income tail was undecided — blocking the normalizer's `INCOME/ROYALTY/ADJUSTMENT`/etc. branch, the XIRR correctness rule, and the §7 doc edit. D4 resolves both. Grounded in the real dummy files.

**1. `includeInXIRR` modeling & placement (confirmed):**

- **Explicit per-Cashflow boolean, kept** (D1 as-is) — flexible, per-row override, flippable (OQ-N) with no schema change.
- **Cashflow-item-ONLY attribute.** `true` = counted in the per-currency XIRR timeline (AP-13); `false` = stored for a faithful record but excluded from the math. _(EVENT Trades do NOT carry it — see D3 tidy-up.)_
- **Justification:** storage ≠ XIRR-inclusion — we deliberately store some Cashflows that must NOT count (SPAXX sweeps, RSU-tax adjustments); the boolean is exactly that switch.

**2. `cashflowType` enum grows 6 → 10 values (final):**
`BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, INCOME, FEE, ROYALTY, ADJUSTMENT`

- **New vs. current §7.5 six-value enum:** `INTEREST, INCOME, ROYALTY, ADJUSTMENT` added.
- **`INTEREST` is its own type** (interest is a distinct, user-facing return; not folded into INCOME).
- **`INCOME`** = genuine catch-all for money-in rows without a cleaner named type (stock-lending, promo bonus).
- **The exact broker code is always preserved in `rawAction`** (L8) — no granularity lost by a coarse enum.
- **No `CAPITAL_GAINS` type** — `LCAP/SCAP` fold into `DIVIDEND`; `rawAction` retains the distinction for any Phase-2 split.

**3. Per-code mapping (from the dummy files):**

| Broker code / row                               | File wording                               | `cashflowType`                                                                                                                                                                       | `includeInXIRR`  |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `INT` (RH)                                      | "Interest Payment"                         | **INTEREST**                                                                                                                                                                         | true             |
| `SLIP` (RH)                                     | "Stock Lending"                            | **INCOME**                                                                                                                                                                           | true             |
| `GDBP` (RH)                                     | "Gold Deposit Boost Payment" (promo bonus) | **INCOME**                                                                                                                                                                           | true             |
| `MDIV` (RH)                                     | "Manufactured Div"                         | **DIVIDEND**                                                                                                                                                                         | true             |
| `LCAP` (RH)                                     | "Cap Gains" (long-term distribution)       | **DIVIDEND**                                                                                                                                                                         | true             |
| `SCAP` (RH)                                     | "Cap Gains" (short-term distribution)      | **DIVIDEND**                                                                                                                                                                         | true             |
| `CDIV` (RH)                                     | "Cash Div"                                 | **DIVIDEND**                                                                                                                                                                         | true             |
| `ROYALTY TR PYMT` (Fidelity, MSB)               | royalty payment                            | **ROYALTY**                                                                                                                                                                          | true             |
| `JOURNALED RSU <tax>` (Fidelity)                | RSU tax withholding                        | **ADJUSTMENT**                                                                                                                                                                       | **false** (OQ-N) |
| SPAXX `PURCHASE/REDEMPTION` (Fidelity)          | money-market sweep                         | _(stored, hidden; **no distinct `cashflowType`** — "SWEEP" is NOT one of the 10 D4 enum values; represented as a stored+hidden Cashflow with `includeInXIRR=false`, not a new type)_ | **false**        |
| `Electronic Funds Transfer Received` (Fidelity) | external deposit                           | **DEPOSIT**                                                                                                                                                                          | true             |
| `Electronic Funds Transfer Paid` (Fidelity)     | external withdrawal                        | **WITHDRAWAL**                                                                                                                                                                       | true             |

Everything stored **counts in XIRR except** `ADJUSTMENT` (RSU-tax) and SPAXX sweeps.

**4. One uploaded-file row ≠ one stored item (ADR-011, restated for clarity):** buy/sell → **Trade + Cashflow** (2 items); deposit/withdrawal/dividend/interest/income/fee/royalty/adjustment → **Cashflow only** (1 item); D3 EVENT → **Trade only** (1 item).

**Corrected canonical statement (for the source-doc batch edit):** _"Every row in an uploaded file is imported and stored, except (i) rows recognized as duplicates and (ii) rows whose transaction type is intentionally unsupported (SKIP). A buy/sell row is stored as two items — a Trade (for history) and a Cashflow (for XIRR); a deposit/withdrawal/dividend/interest/income/fee/royalty/adjustment row is stored as a Cashflow only; a non-cash position event (D3) is stored as a Trade only. Every Cashflow item carries an `includeInXIRR` boolean stating whether that money movement counts in XIRR — `false` for items stored for the record but not counted (internal money-market sweeps, RSU-tax adjustments). Imported/stored ≠ necessarily shown in Trade History."_

**New open question — OQ-P:** the coarse-enum + `rawAction` mappings for the income tail (`SLIP`/`GDBP` → INCOME; `LCAP`/`SCAP`/`MDIV` → DIVIDEND; `GDBP` counted in XIRR as a promo bonus) should be verified against real broker files/edge cases; `includeInXIRR` is flippable per row without re-modeling if an assumption proves wrong.

### ✅ D5 — FIDELITY EXTERNAL CASHFLOWS + SPAXX CORE SWEEPS — LOCKED (2026-08-27; REVISED 2026-08-27 after richer file)

> XIRR (AP-13, §5.4) needs external **deposits/withdrawals** to be correct. **CORRECTION (richer `fidelity-2025.csv`):** Fidelity **DOES** emit external cashflows as **`Electronic Funds Transfer Received`** (deposit, Amount +) and **`Electronic Funds Transfer Paid`** (withdrawal, Amount −) rows — 13 in that file. The first dummy file simply contained none, which led to the original "missing-data-source" premise; that premise is now **superseded**. SPAXX `PURCHASE/REDEMPTION` sweeps remain **internal** cash↔money-market moves (not external, never cross the wallet↔portfolio boundary).

**Chosen approach — REVISED: map the transfer rows; reconciliation is only a fallback.**

1. **`Electronic Funds Transfer Received` → DEPOSIT, `Paid` → WITHDRAWAL**, both **`includeInXIRR=true`** (sign already correct in the `Amount` column). Cashflow-only (empty Symbol, no Trade). → **Fidelity XIRR is now properly funded** wherever these rows exist. (D1 + D7 amended accordingly.)
2. **SPAXX `PURCHASE/REDEMPTION` sweeps** → stored, **`includeInXIRR=false`**, **hidden from Trade History** (unchanged; internal cash-form change). SPAXX **interest** (`DIVIDEND RECEIVED SPAXX`) remains DIVIDEND, `includeInXIRR=true`.
3. **Still no manual entry** (D13 intact) — we take deposits/withdrawals only from the file's own transfer rows.
4. **"External contributions not included" notice → narrowed to a degraded-mode fallback:** shown only if a given upload genuinely contains **no** transfer rows (otherwise not shown). No blanket notice.
5. **`Cash Balance` reconciliation → demoted to a Phase-2 _fallback_** (only to fill gaps if some external movement isn't represented by a transfer row), not the primary plan. Still pairs with the Phase-2 position tracker if ever needed.

**Verified:** adding the two EFT `classify` rules keeps the classifier at **0 ties / 0 unmapped across BOTH Fidelity files (588 Action rows total)**.

**Rejected alternatives (unchanged):** ask user to enter deposits (violates D13); build full reconciliation in Phase 1 (unnecessary now that transfer rows exist); external statement/API (out of scope).

**OQ-K updated:** **largely resolved** — Fidelity external cashflows are captured from `Electronic Funds Transfer Received/Paid` rows (`includeInXIRR=true`); residual = verify transfer-row wording/coverage across more real exports (tracked with OQ-Q). Reconciliation kept as a Phase-2 fallback only.

### 🔴 HIGH-severity OPEN decisions (block the data model)

- **D1 — ✅ DONE (see the locked catalogue above).**
- **D2 — ✅ DONE (see the locked per-broker dedup fingerprint above).** _(D9 confirmed D2 UNCHANGED — the once-paused Cash-Balance-free revision is CANCELLED for Phase 1; Fidelity keeps the `Cash Balance` key, verified stable across re-downloads. Cash-Balance-free key is a Phase-2 multi-account concern.)_

- **D3 — ✅ DONE (see the locked D3 block above — hybrid: stamp `eventType`, EVENT rows inert & shown as informational, interpretation deferred to Phase 2).**
- **D4 — ✅ DONE (see the locked D4 block above — `cashflowType` grows to 10 values incl. INTEREST/INCOME/ROYALTY/ADJUSTMENT; per-Cashflow `includeInXIRR` boolean kept; per-code mapping locked; OQ-P logged).**
- **D5 — ✅ DONE (see the locked D5 block above — Option D: sweeps `includeInXIRR=false` & hidden; Fidelity external deposits not in file & not fabricated; Fidelity XIRR shown with a notice; `Cash Balance` reconciliation deferred to Phase 2; OQ-K raised to High).**

### ✅ D6 — STOCK-VS-ETF CLASSIFICATION — LOCKED (2026-08-27)

> The Trade item needs an `instrumentType` (`Stock`/`ETF`/`Option`/`IndexOption`/`MutualFund`/…) on every US equity row, but **neither US file has a type column** — the only Stock-vs-ETF signal is inconsistent free-text in the Description (many ETFs include "ETF" in the name; plain company names give no positive "stock" signal). MEDIUM severity: XIRR/dedup unaffected, and the FR-H5 chart renders identically for both Stock and ETF — so this is a **labelling** decision, not a correctness one. Consumer = FR-H5 label + future asset-class features.

**Chosen approach — Option 4a (modified): conservative "default Stock, upgrade to ETF only on an unambiguous marker."**

1. **Default `instrumentType = Stock`** for every US exchange-listed share (Robinhood/Fidelity).
2. **Upgrade to `ETF` only when the Description contains an unambiguous ETF marker** — the token **"ETF"** (or "EXCHANGE TRADED FUND"). **Conservative match only** — do NOT trigger on "TRUST"/"FUND"/"SHARES"/"PORTFOLIO" (false-positive risk, e.g. "MESABI TRUST" is a stock).
3. **Never emits a wrong ETF** (only upgrades on a clear signal); may under-label some ETFs as `Stock` — **acceptable**, since FR-H5 charts both identically and XIRR is unaffected.
4. Options/IndexOption (D10 symbol parse) and MutualFund/MoneyMarket (Fidelity names them; D1/D5) are unaffected. Zerodha is EQ-vs-FO by file/segment, no Stock/ETF split needed.

**Rejected alternatives:** Option 1 (collapse to a single `Equity` type — user prefers keeping the two labels); Option 2 (broad keyword heuristic incl. FUND/TRUST — false positives, silently-wrong labels); Option 3 (external symbol lookup now — network dependency + ties to unresolved OQ-E, too heavy for a cosmetic label).

**OQ-L updated:** Phase-1 = conservative default-Stock/upgrade-ETF heuristic; **Phase-2** = authoritative symbol lookup (likely via the OQ-E price/data provider) to backfill true Stock/ETF (and other) types. Reconciliation note for the doc edit: `FEATURES.md §4` still lists Stocks and ETFs as tracked types — they are tracked; ETF is best-effort-detected in Phase 1.

### ✅ D7 — `columnMapping` STRUCTURE — LOCKED (2026-08-27)

> How the BrokerMapper turns a raw file row into our normalized attributes. Broker columns don't map 1-to-1: some are renames, some are clean codes, and one (Fidelity `Action`) is free text needing classification. Grounded in the real dummy files; the Fidelity classifier was validated against all 319 Action rows (0 ties, 0 unmapped).

**`columnMapping` has FOUR entry kinds:**

1. **`direct`** — copy one source column → one attribute (+ D11/D12 number/date cleanup). Fidelity `Price/Quantity/Amount/Run Date/Symbol`; Zerodha `price/quantity/trade_date`.
2. **`lookup`** — translate a finite code column via a fixed dictionary. Robinhood `Trans Code` (STO/BTC/BTO/STC/CDIV/INT/ACH/SLIP/GDBP/MDIV/LCAP/SCAP/…) → fixed fields. This IS the D1/D4 catalogue as data.
3. **`classify`** — for a free-text, no-code column (Fidelity `Action`): a **word-set classifier** (below) that yields the CATEGORY + side/openClose/flags only.
4. **`extract`** — a shared parser that decodes the **structured Symbol code** into option details; reused across brokers.

**`classify` engine (Fidelity `Action`):**

- **Tokenize on non-letters** → uppercase whole-word set (`RSU####`→`RSU`; `CALLS` ≠ `CALL`). Case-insensitive.
- A rule matches if the row contains **all** its required words.
- **Largest matched word-set wins** (auto-resolves generic-vs-specific overlap, e.g. `{SOLD}` ⊂ `{OPENING,PUT,SOLD}`; no manual ordering).
- **Exact-size tie → `unmapped`; no match → `unmapped`** → surfaced in preview "needs attention" (L5/L6). Never silently dropped/guessed.
- **Glue-free:** rules key only on meaning-bearing words (verbs + CALL/PUT/SPAXX/…), NEVER connective glue (`AS OF`, `INTO`, `TRANSACTION`) → minor broker rewording still classifies; genuine vocab change fails safely to `unmapped` (admin updates mapper, L3).

**Fidelity `Action` word-set rules (26 variants incl. EFT; validated 0 ties/0 unmapped across BOTH files = 588 rows):**

| Required whole-words                                           | Emits                                                                                                                           | includeInXIRR          | extract |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| `{ASSIGNED,CALL}` / `{ASSIGNED,PUT}`                           | eventType=ASSIGNMENT, instrumentType=Option                                                                                     | — (EVENT, no cashflow) | option  |
| `{EXPIRED,CALL}` / `{EXPIRED,PUT}`                             | eventType=EXPIRATION, instrumentType=Option                                                                                     | —                      | option  |
| `{ASSIGNED,CALLS,SOLD/BOUGHT}` / `{ASSIGNED,PUTS,SOLD/BOUGHT}` | side←verb, instrumentType=Stock, cashflowType←side                                                                              | true                   | —       |
| `{OPENING,CALL/PUT,SOLD/BOUGHT}`                               | side←verb, openClose=OPEN, instrumentType=Option, cashflowType←side                                                             | true                   | option  |
| `{CLOSING,CALL/PUT,SOLD/BOUGHT}`                               | side←verb, openClose=CLOSE, instrumentType=Option, cashflowType←side                                                            | true                   | option  |
| `{PURCHASE,CORE,SPAXX}` / `{REDEMPTION,CORE,SPAXX}`            | stored+hidden (hideFromHistory); **no distinct `cashflowType`** — NOT a "SWEEP" enum value (reconciled to the D4 10-value enum) | **false**              | —       |
| `{DIVIDEND,RECEIVED}`                                          | cashflowType=DIVIDEND                                                                                                           | true                   | —       |
| `{ROYALTY,PYMT}`                                               | cashflowType=ROYALTY                                                                                                            | true                   | —       |
| `{JOURNALED,RSU}`                                              | cashflowType=ADJUSTMENT                                                                                                         | **false**              | —       |
| `{RSU,BOUGHT}`                                                 | side=BUY, instrumentType=Stock, price=0, note=RSU                                                                               | true (0 effect)        | —       |
| `{ELECTRONIC,FUNDS,TRANSFER,RECEIVED}`                         | cashflowType=DEPOSIT (Cashflow-only, empty Symbol)                                                                              | true                   | —       |
| `{ELECTRONIC,FUNDS,TRANSFER,PAID}`                             | cashflowType=WITHDRAWAL (Cashflow-only, empty Symbol)                                                                           | true                   | —       |
| `{BOUGHT}` / `{SOLD}` (generic catch-all)                      | side←verb, instrumentType=Stock, cashflowType←side                                                                              | true                   | —       |

**Underlying / symbol source (IMPORTANT; corrected in D10):** option details (right/underlying/strike/expiry) are parsed by the shared `extract` helper from the **broker-specific source defined in D10** — **Fidelity** from the `Symbol` code (e.g. `-AMZN260731C252.5`); **Robinhood** from the `Description` (e.g. `COLD 7/18/2025 Put $17.50`); **Zerodha** from its structured symbol (deferred, D10). For **Fidelity**, the `Action` column is used only for `classify` (category), never for option-detail extraction, and the equity underlying/`rawSymbol` comes from the `Symbol` column via `direct`. **Robinhood has NO `Action` column** — it classifies from `Trans Code` (`lookup`) and extracts option details from `Description`; its `Instrument` column holds the plain underlying ticker. RSU-tax (Fidelity) rows have an empty `Symbol` (correct — no security). **See D10 for the exact per-broker parse regexes.**

**Per-broker:** Fidelity = `direct` + `classify(Action)` + `extract(Symbol)`; Robinhood = `direct` + `lookup(Trans Code)` + `extract(Description)` (no Action column); Zerodha = `direct` + structured symbol parser (no free-text classify; option parse deferred — D10).

**Where earlier decisions live:** D1/D4 → lookup + classify emits; D3 eventType → assignment/expiration rules; D5 sweeps → SPAXX rules; D6 Stock/ETF → classify default Stock; D10 option parse → shared extract.

**Rejected:** regex-rule engine and keyword-scoring engine as the primary mechanism (more machinery than justified for 5–6 fixed brokers; silent-misroute risk); fully-declarative admin-authored regex (unsafe/over-engineered). Chosen shape keeps clean columns as data (direct/lookup) and the one free-text column as a word-set classifier.

**New open question — OQ-Q:** the Fidelity `Action` word-sets + `Symbol`-column reliability are derived from the dummy file (0 ties/0 unmapped on 319 rows); verify against a real multi-year Fidelity export (rare verbs: average-price/agency-cross/transfers/fee-reversals; confirm `Symbol` populated on all security rows). Safe-fail to `unmapped` protects XIRR meanwhile.

### 🟠 MEDIUM-severity OPEN decisions

- **D6 — ✅ DONE (see the locked D6 block above — Option 4a modified: default `Stock`, upgrade to `ETF` only on an unambiguous "ETF" marker; never a wrong ETF; Phase-2 lookup backfills; OQ-L updated).**
- **D7 — ✅ DONE (see the locked D7 block above — columnMapping = direct + lookup + classify(word-set, Action, largest-set-wins, safe-fail) + shared extract(structured Symbol code); underlying from Symbol column; OQ-Q logged).**

### ✅ D8 — CAPTURE SECURITY IDENTIFIER (CUSIP/ISIN) — LOCKED (2026-08-27)

> Each file carries a stable-ish security identifier we weren't storing: **Robinhood CUSIP** (buried in `Description` as `CUSIP: 03064D108`, equities/ETFs only — absent on options & cash rows), **Zerodha ISIN** (clean `isin` column, EQ only — blank on FO), **Fidelity has NONE** (only the `Symbol` column). MEDIUM severity: no Phase-1 feature reads it (XIRR/dedup/history/chart key on ticker/symbol); value is Phase-2.

**Chosen approach — Option 2: capture both into ONE optional neutral field.**

1. Add **`securityId`** + **`securityIdType`** (`CUSIP`/`ISIN`) as **optional** Trade attributes (refines HANDOFF §9's `cusip`/`isin` placeholder into one neutral, extensible pair).
2. **Populate where present:** Zerodha `isin` column → `direct` (zero cost); Robinhood `Description` CUSIP → a one-line `CUSIP:\s*(\w+)` rule added to the D7 `extract` for Description. **Absent** on Fidelity rows, option rows, cash rows — **never fabricated**.
3. **NOT part of identity** — does not touch the locked D2 dedup fingerprints; descriptive metadata only.
4. **Stored, not used, in Phase 1** — Phase-2-facing.

**What the identifier actually buys (corrected understanding — it is NOT a stable-across-merger key):** a merger _changes_ the CUSIP; the **change is the signal**. Real SIRI case = two same-day `MRGS` rows, same ticker `SIRI`, DIFFERENT CUSIPs: `829933100` (old, OUT) → `82968B103` (new, IN). So `securityId` helps Phase-2 (a) **disambiguate the outgoing/incoming legs** of a corporate action, (b) **match a reorg to the correct historical position**, and (c) **link the same security across brokers** where the id exists. In Phase 1 it is inert.

**Rejected:** Option 1 skip (loses identifiers permanently under forward-only L9/OQ-M); Option 3 Zerodha-ISIN-only (asymmetric — no US CUSIP, misses the US cross-broker/merger case); Option 4 raw-only (unqueryable, skip-in-disguise).

**New open question — OQ-R:** verify Robinhood always formats CUSIP as `CUSIP: <id>` in Description and that Zerodha ISIN is reliably populated on EQ rows / blank on FO — against real exports. **Caveat:** Fidelity provides NO CUSIP/ISIN, so cross-broker id-linking is inherently one-sided (RH↔Zerodha only, and even that rarely overlaps by market); Fidelity merger-leg pairing would rely on its own event rows, not an id.

- **D8 — ✅ DONE (see the locked D8 block above — Option 2: capture `securityId`+`securityIdType` as optional Trade attributes where present; Zerodha ISIN via direct, RH CUSIP via Description extract; non-identity, Phase-2-facing; OQ-R logged).**

### ✅ D9 — FIDELITY SINGLE-ACCOUNT SCOPE + ACCOUNT IDENTITY — LOCKED (2026-09-03)

> Resolved via 4 real files (`Dummy-fidelity-tradebook.csv`, `fidelity-2025.csv`, `fidelity-2026_01 - 2026_06.csv` = single-account w/ `Cash Balance`; `fidelity.csv` = multi-account w/ `Account`+`Account Number`, NO `Cash Balance`). Key fact: **`Cash Balance` and the multi-account layout are mutually exclusive** — Fidelity offers two distinct download modes. Settled as Q1–Q7 + Decisions A/B/DRIP below.

**Q1 — Phase 1 accepts SINGLE-ACCOUNT Fidelity only** (the `Cash Balance` layout). Multi-account/combined export → **Phase 2**. This keeps D2 intact (see below) and defers 401k-in-combined + the Cash-Balance-free key entirely to Phase 2.

**Q2 — `accountId` for no-account-column files = an OPAQUE, deterministic per-(user,broker) id.** 3 of 4 file types carry NO account identifier (Robinhood, Zerodha EQ, Zerodha FO, and Fidelity single-account); only multi-account Fidelity does. The model mandates `accountId` on every Trade/Cashflow (drives GSI1) but no file names it, so **we mint one Beyond Folio account per (user, broker)**. **Representation (FINAL — not a `userId#broker` concatenation):** `accountId` is a short opaque token — `acc_rh` (Robinhood), `acc_fid` (Fidelity), `acc_zer` (Zerodha) — deterministic per (user, broker) so **find-or-create by `(userId, broker)`** is an idempotent conditional write. `broker` stays a **separate attribute** (already the case per §3.2/§7.2/§7.4 — no change to how broker is stored); it is NOT encoded into / parsed out of `accountId`. `accountType` is **optional** — set only where the file states it: **Zerodha = `Individual`**; **Fidelity single-account = unset**; **Robinhood = unset** (don't guess). Zerodha's two files (EQ+FO) → same `acc_zer` → naturally unified. **Consequence + coupled reframe:** the real Phase-1 use case is **filter-by-broker**, not filter-by-sub-account — so **GSI1/AP-11/§5.10/§10.3 reframe from "by account" → "by broker"**, and **GSI1 keys on the `broker` attribute: `GSI1PK = USER#<userId>#BROKER#<broker>`** (NOT on `accountId`, since `accountId`=`acc_rh` and `broker`=`Robinhood` are now distinct values). Multi-account-per-broker (separate Roth/401k) is the Phase-2 story (arrives with the multi-account file). **This is a data-model reframe (not just prose) — must be a coordinated all-or-nothing sweep** across §8.1, AP-11, §5.10, §10.3, §7.2, §7.4 (GSI1PK), §11.3 examples, §12; + `systemPatterns.md`, `projectbrief.md`, `productContext.md`; recorded in the deferred doc-edit list (HANDOFF §9 / `HANDOFF-DOCS-EDIT.md`).

**Q3 — D2 UNCHANGED; D2-REVISION CANCELLED.** Because Phase 1 = single-account only, Fidelity keeps its locked `Cash Balance` fingerprint. **Verified stable across re-downloads:** overlapping rows in `Dummy-fidelity-tradebook.csv` vs `fidelity-2026…csv` carry identical `Cash Balance` (e.g. 06/29/2026 SOUN assignment → `41037.94` in both) → re-upload dedup works; same-day same-price option pairs differ by balance → no false collision. The paused Cash-Balance-free natural-key + `#N` idea is **shelved for Phase-2 multi-account**, not adopted now.

**Q5 — Rejection UX (hard-stop, L3):** register the **multi-account header as a known-but-unsupported `headerFingerprint`**. A file matching it → **specific message** ("This looks like a Fidelity combined/multi-account statement — please download a single-account statement per account and upload those"). A file matching **no** fingerprint → **generic** "contact support". (One Fidelity mapper in Phase 1 = the single-account header.)

**Q6 — Reframe PRD FR-I2** (currently "Fidelity combined CSV, multiple accounts in one file") → single-account Phase-1, multi-account noted as Phase-2. Deferred to the batched edit.

**Q4/Q7 — CATALOGUE ALL FIDELITY VERBS AS LIVE PHASE-1 RULES** (the single-account _layout_ can legitimately carry any of these — e.g. a standalone 401k download — so we handle, never skip; even though our 3 single-account samples happened not to contain them). Q7's **Description-branch is LIVE** (not dormant). Live verb classifications (raw string always preserved in `rawAction`; stored category unchanged — no new enum values):

| Fidelity Action                                                   | Category                                                                                                 | Underlying from                     | includeInXIRR        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- |
| `REINVESTMENT <sec>`                                              | **BUY** (labelled **"DRIP"** in notes — reinvested-dividend buy; neg amount, fractional qty, real price) | `Symbol`                            | true                 |
| `DIVIDEND RECEIVED … FDRXX`                                       | DIVIDEND                                                                                                 | `Symbol` (FDRXX)                    | true                 |
| `FDRXX` sweeps (`PURCHASE/REDEMPTION … FDRXX`, parallel to SPAXX) | sweep, hidden                                                                                            | `Symbol`                            | false                |
| `Contributions` (401k; **Decision A**)                            | **BUY** (`instrumentType=MutualFund`)                                                                    | **`Description`** (Q7 branch, LIVE) | true                 |
| `Transfers` (401k, qty 0 / amt 0)                                 | EVENT / inert non-cash (like D3)                                                                         | `Description`                       | excl. (structural)   |
| `TRANSFERRED FROM TO BROKERAGE OPTION` (**Decision B**)           | internal transfer                                                                                        | — (none)                            | **false** (excluded) |

**DRIP note (OQ-C evidence):** `fidelity.csv` shows the textbook reinvestment pairing — same day, same security: `DIVIDEND RECEIVED HRB +4.20` then `REINVESTMENT HRB −4.20` buying `0.131` sh @ `31.99` (also HPQ +9/−9/0.473; IDT +0.70/−0.70/0.015). Recorded as **two independent rows** (DIVIDEND + BUY); cash nets to zero, position grows by the fractional qty — no double-count. "DRIP" is the descriptive label only; stored `cashflowType=BUY`. Feeds **OQ-C**.

**Full single-account catalogue = 100% covered** by existing decisions (SPAXX sweeps D5; BUY/SELL + OPENING/CLOSING options D1/D7/D10; ASSIGNED/EXPIRED events D3; YOU SOLD/BOUGHT ASSIGNED shares → real SELL/BUY; DIVIDEND D1/D4; ROYALTY D4; RSU#### BUY@0 OQ-N; JOURNALED RSU ADJUSTMENT excl D4; VSP/AGENCY CROSS/EXEC-MULT-EXCHG/EX-DIV noisy prefixes stripped by D7 classifier; EFT Received/Paid → DEPOSIT/WITHDRAWAL D5) plus the newly-catalogued verbs above.

- **D9 — ✅ LOCKED — see block above.** Q1 single-account only; Q2 `accountId` = opaque per-broker id (`acc_rh`/`acc_fid`/`acc_zer`), `broker` separate attribute, `GSI1PK = USER#<userId>#BROKER#<broker>`, find-or-create by (user,broker); GSI1→"by broker" reframe; Q3 D2 unchanged (revision cancelled); Q4/Q7 all verbs LIVE; Q5 specific vs generic rejection; Q6 FR-I2 reframe; Decisions A (Contributions→BUY) / B (TRANSFERRED→excluded) / DRIP (REINVESTMENT→BUY). Multi-account Fidelity → Phase 2.

### ✅ D10 — OPTION `optionDetails` PARSE RULES — LOCKED (Fidelity + Robinhood + Zerodha, 2026-09-03)

> The per-broker parsers behind D7's shared `extract` helper. Each yields `optionDetails = {underlying, right, strike, expiry}`. Grounded in every distinct option identifier in the real files.

**Fidelity — parse the `Symbol` code (LOCKED).** Verified across 96 distinct codes.

- Regex on `Symbol`: `^-([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])([0-9.]+)$`
- `underlying` = grp1 (AMZN/CRM/MSB/NOW/SOUN/TLT/VTR/AAPL/MSFT); `expiry` = `20YY-MM-DD` (grp2/3/4); `right` = `C`→CALL / `P`→PUT; `strike` = grp6 (**decimal supported** — `232.5`, `242.5`, `10.5`, and whole `30`/`250`).
- Leading `-` is how D7 tells an option `Symbol` from an equity ticker.

**Robinhood — parse the `Description` (LOCKED).** Verified across all distinct option descriptions. Robinhood has **no `Action` column**; `Instrument` holds the plain ticker.

- Regex on `Description`: `^(?:Option (?:Expiration|Assignment) for )?([A-Z.]+) (\d{1,2})/(\d{1,2})/(\d{4}) (Call|Put) \$([0-9.]+)$`
- `underlying` = grp1 (`.` allowed, e.g. BRK.B); `expiry` = `YYYY-MM-DD` (M/D 1–2 digits, 4-digit year); `right` = Call/Put; `strike` = grp6.
- **Optional prefix** `Option Expiration for ` / `Option Assignment for ` handles the **`OEXP`/`OASGN`** rows (D3 EVENT rows: `eventType=EXPIRATION/ASSIGNMENT`) — the same parser recovers the contract from the prefixed Description; the classifier still tags them as events via `Trans Code`.

**Format differences (why two parsers):** Fidelity `Symbol`/`YYMMDD`/`C`/`P`/variable-decimal strike vs Robinhood `Description`/`M/D/YYYY`/`Call`/`Put`/2-decimal strike. Both feed the **same** D7 `extract` and produce the **same** `optionDetails` shape.

**Failure mode:** a code that doesn't match → option row still imports; `optionDetails` left incomplete and flagged (safe-fail, per D7). LOW risk — both formats fully regular in the files.

**Verify-flag:** Fidelity `YY→20YY` assumption (all samples 25/26); confirm no pre-2000/far-future edge on a longer export.

**Zerodha — parse the `symbol` + read `expiry_date` column (LOCKED).** Runs only on the `segment=FO` file (the EQ file never carries options). KiteConnect encoding confirmed.

- **underlying** = leading `[A-Z]+` run (stops at first digit): `MAXHEALTH`, `NIFTY`, `HDFCBANK`, `PAGEIND`, `RELIANCE`, `TCS`, `INFY`, `ASIANPAINT`.
- **right** = trailing 2 chars: `CE`→CALL / `PE`→PUT.
- **expiry** = **read directly from the `expiry_date` column** (`DD/MM/YY` → `YYYY-MM-DD`, per D11) — NOT decoded from the symbol. This sidesteps the monthly-vs-weekly encoding entirely.
- **strike** = the middle, isolated by **building the expiry-derived date token and stripping it**: **monthly** = `YY`+`MMM` (3-letter month, e.g. `26JUN`); **weekly** = `YY`+`M`+`DD` where M = `1`–`9` for Jan–Sep and `O`/`N`/`D` for Oct/Nov/Dec (e.g. `26707`, `23N01`). Match the symbol's middle (after underlying) against the token the `expiry_date` predicts, strip it → remaining digits before `CE`/`PE` = **strike**. Self-validating: if neither token matches → safe-fail.
- **instrumentType = `Option` for ALL Zerodha options (Option A).** IndexOption (NIFTY/BANKNIFTY/SENSEX…) is NOT classified in Phase 1 — deferred to a Phase-2 lookup/known-index-set backfill (mirrors the D6/OQ-L Stock→ETF pattern). New **OQ-T** logged.
- **Safe-fail (enforced, not assumed):** a symbol whose date-token matches neither monthly nor weekly form, **OR a `FUT` (futures) row** — futures are **out of Phase-1 scope (options only)** — → flagged/skipped row, never silently mis-parsed as an option (consistent with D7/D10). Verified: `MAXHEALTH26JUN900PE`+`30/06/26`→`26JUN`→strike 900/PUT; `NIFTY2670723650PE`+`07/07/26`→`26707`→strike 23650/PUT; `BANKNIFTY23N0144500CE`(01 Nov 23)→`23N01`→strike 44500/CALL.

**Cross-ref:** invoked by the D7 `extract` entry-kind (D7 ↔ D10 are the same mechanism; keep in sync in the source-doc edit).

- **D10 — ✅ LOCKED — see the D10 block above.** Fidelity (`Symbol` code) + Robinhood (`Description`) + **Zerodha** (`symbol` + `expiry_date` column; strike isolated via expiry-derived token strip; all `Option`, IndexOption→Phase-2/OQ-T; FUT + non-match safe-fail) option parsers all LOCKED. Closes D1–D14.

### ✅ LOWER-severity decisions (D11–D14 — all LOCKED)

### ✅ D11 — DATE NORMALIZATION — LOCKED (2026-08-27)

> Mechanical normalization: parse each broker's date format → our canonical `YYYY-MM-DD` (ADR-009, embedded in Trade/Cashflow `SK`s + part of the D2 dedup key). The one real trap is month-first vs day-first, which must be **keyed off the broker**, never guessed per value (`05/06/25` = May 6 in US files; Zerodha `21/08/25` = 21 Aug).

**Per-broker rule (authoritative date column + how to read it):**

| Broker    | Column                                                                                | Read as                                                    | Store                       |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| Robinhood | `Activity Date`                                                                       | **month-first** (M/D/Y), 1–2-digit M/D, 2- or 4-digit year | `YYYY-MM-DD`                |
| Fidelity  | `Run Date`                                                                            | **month-first** (M/D/Y), 2- or 4-digit year                | `YYYY-MM-DD`                |
| Zerodha   | `order_execution_time` (ISO `YYYY-MM-DDTHH:MM:SS`, already unambiguous, carries time) | ISO                                                        | `YYYY-MM-DD` (date portion) |

**Rules:** direction pinned per broker (RH/Fidelity month-first; Zerodha's `trade_date` is day-first but we use the ISO `order_execution_time` instead); **`YY` → `20YY`**; flexible width absorbs the mixed 2/4-digit-year + 1/2-digit-month variants seen within a single RH/Fidelity file; sanity-check (month 1–12, day 1–31) so a malformed date **safe-fails to a flagged row** (never a silent wrong guess).
**Optional enrichment:** retain Zerodha's full `tradeDateTime` (ISO has real intraday time) for same-day ordering / the Phase-2 position tracker (OQ-B). RH/Fidelity have no intraday time in the files → date-only.
**Storage vs display (clarified):** storage format is the single canonical `YYYY-MM-DD` (this decision is only about parsing INPUT). A **user-selectable display date format** is a UI concern → **Phase-2 backlog** (no data-model impact; any stored `YYYY-MM-DD` renders in any format).
**New open question — OQ-S:** verify the `YY→20YY` assumption (samples are 24/25/26) and confirm RH/Fidelity carry no intraday time on a longer real export.

- **D11 — ✅ DONE (see the locked D11 block above — per-broker date parse → canonical `YYYY-MM-DD`; RH/Fidelity month-first, Zerodha ISO `order_execution_time`; `YY→20YY`; safe-fail; display-format toggle → Phase-2 backlog; OQ-S logged).**

### ✅ D12 — NUMBER / FORMAT CLEANUP — LOCKED (2026-08-27)

> Normalize raw file fields → clean canonical values for **DynamoDB storage + the math/dedup that runs on them** (INPUT→STORAGE; NOT a UI/display concern — display formatting is decided at render time from the clean stored value, Phase-2). All rules operate on **parsed** values (post-CSV-parse), never raw bytes.

**Overarching rule:** mandate an **RFC-4180 CSV parser** (handles quoted fields, embedded commas, embedded newlines). Transport-level quotes are the parser's job, NOT a data-cleanup step — there are **no data-level quotes** in any broker (verified: the `"($1,768.55)"` seen in raw bytes is CSV escaping of the thousands-comma; the parsed value is `($1,768.55)`, 11 chars, no quotes; Fidelity `Action` is unquoted — the only quotes in the multi-account file are footer lines).

**Cleanup rules (on parsed values), broker-scoped:**

- **Robinhood** numbers: strip `$`; strip thousands comma; **`(...)` → negative** (e.g. `($1,768.55)` → `-1768.55`, `$479.74` → `479.74`). These appear on RH only; the comma+CSV-quoting only on values ≥ 1000.
- **Fidelity** & **Zerodha** numbers: **plain** (no `$`, no commas, no parens, no quotes) → nothing to strip; parse as-is (Fidelity uses a plain leading `-` for negatives).
- **`S`-suffix quantity** (RH merger `MRGS` rows: `1S`, `314.3584S`): **strip the `S`, keep the number** (`314.3584`); meaning carried by `eventType=MERGER` (D3); raw preserved in `rawAction`. No separate flag in Phase 1 (Phase-2 tracker via OQ-O).
- **Multi-line `Description`** (RH **equity buy/sell rows only** — they carry `"Name\nCUSIP: …"`): handled by the CSV parser (embedded newline inside a quoted field); CUSIP extracted per D8. NOT all RH rows are multi-line (options/cash are single-line).
- **Zerodha `order_id`** leading apostrophe (`'1000…`, Excel force-as-text): strip the leading `'` if the field is ever used (not in the dedup key — Zerodha uses `trade_id`).

**Footer / junk-row detection (Fidelity multi-account file ends with blank rows + legal disclaimer + `Date downloaded …`):** a row counts as **data only if it has a valid parsed date + a recognized Action/Trans Code**. This cleanly rejects the disclaimer text, blank rows, and the download-timestamp line without hard-coding footer strings. (Optionally also stop at the first all-blank row as an early cut-off.)

**Severity:** LOW–MEDIUM, mechanical — but the parenthesis-negative and multi-line-row cases are silent-corruption traps if mishandled, hence the explicit RFC-4180 + parsed-value rules. Feeds the `columnMapping` `direct` cleanup + the parser spec in the source-doc edit.

**Corrections logged during analysis:** amounts are NOT data-quoted (only CSV-escaped when ≥ 1000); Fidelity `Action` is NOT quoted; multi-line Description is RH equity-rows only — earlier over-generalizations fixed here.

- **D12 — ✅ DONE (see the locked D12 block above — RFC-4180 parser mandate; strip `$`/thousands-comma, `(...)`→negative [RH only]; `S`-suffix stripped (meaning via eventType); Fidelity/Zerodha plain; footer/junk rejected by requiring valid date + recognized Action/Trans Code).**

### ✅ D13 — REWORD "NO MANUAL DATA ENTRY" — LOCKED (2026-09-03)

> Wording fix. Both source docs make an absolute claim ("no manual data entry") that overstates the flow: the locked design (L4–L5) requires **one manual step per upload** — the user reviews a read-only preview (sample + counts) and **confirms** before the write. So the claim is technically false as written. Distinguish _typing in trades by hand_ (never happens) from _the confirmation click_ (does). This is a **source-doc wording change only** — recorded here now; the physical edit rides along in the batched source-doc edit (HANDOFF §9).

**Approved replacement wording (dual-audience style):**

- **`FEATURES.md` §5.1** — replace the final sentence ("No manual data entry is required.") with: _"You never type in your trades by hand — Beyond Folio does the reading for you. The only step on your side is a quick one-time confirmation of each uploaded file before it's imported."_
- **`PRD.md` FR-I4** — replace _"…— **no manual data entry**."_ with: _"The system parses each file into a clean, normalized trade & cash-activity history — **no manual entry of trade data**; the user's only input is a one-time confirmation of the uploaded file on import."_

**Also at the same §5.1/FR-I4 edit (kept as a separate labeled part, NOT merged into one sentence — clearer provenance):** fold in the corrected canonical import statement (D4) per HANDOFF §9.

**Severity:** trivial/wording — but corrects a factual overstatement that would otherwise mislead on the confirmed-mapping UX. Source-of-truth docs remain **untouched** until the batched edit.

> **⤷ REFINED by TRD Decision 1 (§2.3, 2026-09-07):** the "one-time confirmation" is now a **two-step** interaction — **Proceed to Import** (Gate 1, kicks off async processing) then **Confirm** (Gate 2, after reviewing the preview). PRD FR-I4 and FEATURES §5.1 are being updated to reflect two steps + the async "processing → ready for confirmation → complete" status UX. The D13 anti-overstatement intent (distinguish _typing trades by hand_ [never] from _the confirmation click_ [does]) is unchanged — there are simply now two clicks, not one.

### ✅ D14 — RAW-FILE STORAGE (S3) — LOCKED (2026-09-03)

> Do we keep the original uploaded broker file, and if so where/how? Decided: **YES — Option B**: Phase 1 **stores a copy of every confirmed-imported broker file in Amazon S3**, so that Phase-2 features (retroactive re-import per OQ-M; undo-an-import per PRD §6 O6) have the raw material to work on. **Phase 1 only STORES the files — it does NOT build the reprocess/undo engine (that stays Phase 2), and nothing in Phase 1 reads these files.** Rationale: discarded bytes can't be recovered, so not storing them is a silent, permanent gap for any file imported through a later-corrected mapper (L9/OQ-M forward-only); B's cost (a second store + PII-at-rest) is loud and reversible (we can always delete stored bytes later). Rejected: A (defer entirely — permanent gap for pre-Phase-2 imports); C (reserve the slot, store nothing — same gap); D (build undo/reprocess now — scope creep, zero Phase-1 benefit).

**WHEN we store (Fork B — save at confirm):** the S3 save happens as the **first action of the confirm→write step**, alongside writing the `ImportedFile` record + Trades/Cashflows. This gives a perfect **1:1 mirror** (every stored file has exactly one `ImportedFile` record and vice-versa) with **no orphan-cleanup problem**. Files that hard-stop at mapper-match (L3) or that the user cancels at preview are **never stored** — for a support case we simply ask the user to re-send the file (matches the L3 "contact support" message). Rejected Fork A (store every uploaded file incl. rejected/cancelled — adds orphan retention/cleanup rules) and Fork C (hybrid — most machinery).

**Corrected L4 pipeline with S3 placed (Layer-1/Layer-2 semantics UNCHANGED):**
`upload → Layer-1 file-hash dedup → minimal parse (identity fields) → Layer-2 record dedup (counts for preview) → FULL normalize (NEW rows only) → preview → confirm → [ save file to S3 → write ImportedFile record → write Trades/Cashflows with Layer-2 attribute_not_exists ]`. The bracketed group is the write step; the S3 save is its **first** action (file-first, then records). Note Layer-2 runs twice as already locked in L4: once early (count for preview), once re-enforced at write via `attribute_not_exists`.

**Mechanism (on each confirmed import):** (1) reuse the `contentHash` already computed at Layer-1; (2) save the **original bytes, exactly as uploaded (pre-parse)** to S3 at key `<userId>/<contentHash>`; (3) write the `ImportedFile` record with a new **`s3Key`** attribute = that key. Zerodha's two files (equity + F&O) are each independent: own fingerprint, own S3 object, own `ImportedFile` record — **one uploaded file = one S3 object = one `ImportedFile` record**. A Layer-1 duplicate needs **no new S3 write** (the file is already there under the identical key).

> **⤷ REFINED by TRD Decisions 1 & 8 (§2.3/§7.2/§9.5, 2026-09-07):** the raw bytes are now **staged to a temp S3 location at upload** (via a pre-signed direct-to-S3 URL, bytes never transit the backend) and **promoted to the permanent `<userId>/<contentHash>` key on Confirm** — rather than a single "save at confirm as the first write action." The 1:1 mirror and no-orphans guarantees are preserved: unconfirmed uploads live only in `temp/` and auto-expire (never promoted); only a confirmed import creates a permanent object. Written into data model §10.8 + ADR-016. (D14's intent — keep every _confirmed_ file, store-only-in-Phase-1 — is unchanged.)

**The six locked clarifications (with rationale — so developers don't drift):**

1. **Hash = SHA-256 over raw pre-parse bytes.** Same value already used for Layer-1 dedup (`FILE#<contentHash>`) — **one hash, two uses, not a second hash**. Hashing raw bytes (not cleaned data) makes "same file" mean byte-for-byte identical, which is exactly what dedup needs; hashing cleaned data would break under a cleanup-rule tweak (D11/D12).
2. **S3 key = `<userId>/<contentHash>`, NO file extension.** The fingerprint _is_ the identity (matches the DB `FILE#<contentHash>` convention); an extension would be redundant/misleading (Zerodha may be CSV or XLSX). The `<userId>/` prefix keeps each user's files isolated (consistent with ADR-002 per-user rooting). Original filename/type is NOT lost — kept in the existing `fileName` attribute **and** as S3 object metadata (`x-amz-meta-filename`) so the object is self-describing.
3. **`ImportedFile.s3Key` stores ONLY the relative key** (`u_alex/9f2b…`), not the bucket name and not a full `s3://…` URL. The bucket is a single app-config value. Reason: buckets get renamed/moved across dev/CI/prod/regions — baking the bucket into every record would force a mass rewrite; relative-key + config-bucket keeps records portable.
4. **Bucket: versioning OFF, no lifecycle/expiry (keep forever).** Versioning is pointless because writes are idempotent (same file → same key → byte-identical overwrite; no meaningful prior versions). Expiry is actively harmful — it would silently reintroduce the "file gone when Phase 2 needs it" gap we chose B to avoid. Both stated explicitly to stop a developer enabling them out of habit.
5. **No orphan-cleanup job in Phase 1.** An orphan (S3 object with no `ImportedFile` record) can only occur if the S3 put succeeds but the DB write then fails. It's self-healing: on retry the identical file overwrites the same key (idempotent — a file can never spawn multiple orphans), and at Phase-1 scale (tens of users, sub-1 GB) a stray tiny CSV is negligible. A reconciliation job would be more risk/machinery than the problem warrants. (This clean outcome is a direct benefit of Fork B.)
6. **Backend-service-only access; NO download UI (user or admin) in Phase 1.** Least-privilege IAM (`PutObject`+`GetObject` scoped to this one bucket). These files are write-and-leave — nothing in Phase 1 reads them, and they're sensitive PII, so we expose no read path until a Phase-2 feature needs one. Consistent with L3 (rejected files aren't stored anyway; support answer is "re-send it").

**Security/bucket posture:** SSE-S3 (Amazon-managed AES-256, default encryption on the bucket); Block Public Access ON; TLS-only bucket policy (deny non-HTTPS); one bucket, same AWS region as the DynamoDB table.

**Write-order / consistency rule:** **S3 first, then the `ImportedFile` DB record.** If S3 succeeds but the DB write fails, the import is reported failed and the user retries; the identical file overwrites the same S3 object (idempotent), so orphans can't accumulate. A stored file with no record is harmless.

**Out of scope for Phase 1 (explicit):** NOT building retroactive re-import; NOT building undo-an-import; NOT adding any read path that consumes these files. Written and left alone until Phase 2.

**Phase-2 forward notes:** retroactive re-import (OQ-M) reads the file via `ImportedFile.s3Key`, re-runs the corrected mapper, replaces affected rows; undo-an-import (PRD O6) must delete **both** the `ImportedFile` record + its Trades/Cashflows **AND** the S3 object at `s3Key`.

**Doc-edit footprint (deferred to the batched source-doc edit, HANDOFF §9):** `ImportedFile` item (§7.3) gains `s3Key`; a **new ADR** ("raw-file storage in S3 — `userId/contentHash` key, SSE-S3, keep-forever, S3-before-metadata write order, backend-only access") alongside the planned ADR-015; `techContext.md` flips "Raw uploaded-file storage — intentionally left open" → decided; `projectbrief.md`/`systemPatterns.md` note the new S3 store + Phase-1 PII-at-rest posture; **OQ-M** → partially resolved (storage prerequisite met in Phase 1; reprocess/undo engine remains Phase 2).

**Severity:** MEDIUM — introduces the second persistence store (S3 alongside DynamoDB) and pulls PII-at-rest into Phase 1; deliberate accepted trade to eliminate the silent/permanent data-loss gap. Source-of-truth docs remain **untouched** until the batched edit.

### New open questions to formalize in §13 (when we edit docs)

- **OQ-K** — Fidelity external cashflows missing + SPAXX sweeps (D5).
- **OQ-L** — Stock-vs-ETF classification for FR-H5 (D6): Phase-1 conservative default-Stock/upgrade-ETF-on-"ETF"-marker; Phase-2 authoritative lookup backfills.
- **OQ-M** — Mapper correction → retroactive re-import (P2) — **partially resolved by D14**: the raw-file-storage _prerequisite_ is now met in Phase 1 (files kept in S3 at `<userId>/<contentHash>`, referenced by `ImportedFile.s3Key`); only the retroactive-reprocess + undo-an-import _engine_ remains Phase 2.
- **OQ-A** — revise/downgrade (D2 row-ordinal fix). **OQ-J** — resolve (L7 fees).
- **OQ-T (new, from D10)** — Zerodha IndexOption vs Option classification not done in Phase 1 (all Zerodha options tagged `Option`); Phase-2 backfill via a known-index-set / instrument lookup (NIFTY/BANKNIFTY/FINNIFTY/SENSEX/MIDCPNIFTY…). Mirrors OQ-L (Stock→ETF).

### Planned doc edits (deferred until decisions lock)

> **AUTHORITATIVE batch list = `HANDOFF-DOCS-EDIT.md` §3 (9 batches).** The summary below is a quick index only; if it ever disagrees with `HANDOFF-DOCS-EDIT.md`, that file wins.

`DYNAMODB_DATA_MODEL.md`: §3 (+BrokerMapper entity; BrokerAccount note), §4 (new APs: get-mapper-on-upload, admin create/update/delete mapper; confirm no new GSI), §5 (**ADR-015** admin/user-confirmed mapping + normalization step; **new ADR-016** raw-file storage in S3), §6.5 (forward-map row: BrokerMapper + `s3Key`), §7 (BrokerMapper item [four `columnMapping` kinds]; Trade adds `rawAction`/`eventType`/`securityId`+`securityIdType`/`occurrence`/`brokerTradeId`; Cashflow adds `includeInXIRR`/`cashBalance`/`rawAction` + **10-value `cashflowType` enum**; ImportedFile adds `s3Key`), §10 (new "Import & Normalization pipeline" subsection), §11 (worked mapper example), §13 (rewrite OQ-A, mark OQ-J resolved, add **OQ-K…OQ-T**). **Two isolated coordinated sweeps:** (Batch 3) GSI1/AP-11/§5.10/§10.3/§7.2/§7.4/§11.3/§12 reframe **"by account" → "by broker"** (`GSI1PK = USER#<userId>#BROKER#<broker>`); (Batch 4) **`Account` → `BrokerAccount`** rename everywhere. `PRD.md`: FR-I2 → single-account Phase-1 (multi-account = Phase-2); FR-I4 reworded (D13) + D4 canonical import statement. `FEATURES.md`: §5.1 reworded (D13). Memory bank (Batch 9): systemPatterns/techContext/projectbrief/productContext + flip this file + progress to "written into source docs."

### Immediate next step

**ALL import work is COMPLETE and written into the source docs — the active phase is now the TRD** (`TRD.md`, currently empty). The TRD is the engineering **"how"** on top of the finished PRD/FEATURES/data-model. Its starting point — backlog of decisions to make (backend/API/data-access/frontend/IaC stacks; **OQ-F** session mechanism; **OQ-E** market-data provider/range; OAuth library; S3 implementation), what's locked and must-not-reopen, a skeleton outline, and conventions — is in **`HANDOFF-TRD.md`** (the active handoff). A fresh session should read that + the source docs, refine the outline, and author section-by-section with a review gate. `HANDOFF.md` is now a historical design record; `HANDOFF-DOCS-EDIT.md` is archived to `unimportant/`. Convention: **do not fire an editor auto-open/preview command for `DYNAMODB_DATA_MODEL.md`** (reading/editing is expected; the user opens it manually).

---

## Prior Focus (as of 2026-08-03)

> ✅ **Doc consistency pass #2 — broker file formats + fee policy (#1–#8).** Fixed small cross-doc discrepancies and corrected broker-file facts. **File formats:** Robinhood is **1 CSV** (was wrongly XLSX); Fidelity **1 CSV**; Zerodha is now **2 files** (equity + F&O), each **CSV or XLSX** (user's download choice) — the **Zerodha P&L/charges file is removed** (5→4 file types; `ZERODHA_PNL` dropped). Both US files cover equity + options. **Fee policy for XIRR:** **USD (Robinhood/Fidelity) includes fees/commissions** (Fidelity has commission + fees columns; Robinhood only a Gold subscription fee); **INR (Zerodha) is computed _without_ fees** in Phase 1 (charges live only in the un-ingested P&L report; tradebooks carry none) — shown with a **fee-exclusive notice**; capturing Zerodha charges is **Phase 2** (likely an optional P&L upload → period-aggregate `FEE` cashflow). New open questions **OQ-I** (Zerodha fees omitted from INR XIRR) and **OQ-J** (verify Fidelity commission/fees columns vs a real file). Also fixed: PriceCache→**PriceCache + PriceHistory** summaries, **AuthIdentity** added to "what lives here", **PRICEHIST#** row in §6.5, progress.md relational bullets marked superseded, OQ note aligned, Session-10 count clarifier, Layer-1/Layer-2 dedup wording. Edits: `PRD.md` (§6/FR-I1/FR-I3/§7.5/§10 OQ-I/J/§11), `FEATURES.md` (§3/§5.4/§7), `DYNAMODB_DATA_MODEL.md` (§6.1/§6.5/§7.3/§11.4/§11.6/§11.13/§13.1.9-10), memory bank (projectbrief, systemPatterns, techContext, progress, this file). **Import mechanism (parser vs. user-confirmed column mapping) is an OPEN design topic — deferred to its own session.** **Next:** column-mapping design session.

## Prior Focus (as of 2026-07-30)

> ✅ **Documentation consistency pass + XIRR/Admin decisions.** Reconciled discrepancies found across the docs: (1) **PRD metadata** bumped to v1.2 / 2026-07-27 with changelog; (2) **Robinhood file** corrected to **XLSX** (`robinhood.xlsx`) in PRD, projectbrief, and the §11.4 example; (3) **progress.md** "What Works" now marks the retired relational docs as ⚠️ superseded/in `unimportant/`. **XIRR wording** fixed to **per-currency** everywhere (FEATURES §5.4, PRD §5.1, projectbrief, productContext); a **combined base-currency XIRR** is confirmed **Phase 2** (needs per-date FX conversion + supersedes ADR-007 for that view — blending two finished rates is mathematically invalid). **Admin "manage users" discrepancy** logged as **OQ-H** and put **ON HOLD** (documentation-only): admin's Phase-1 role narrowed to "correct symbol mappings"; disable/delete-user deferred (would need a users-enumeration index + a 2nd deliberate exception to ADR-002 + a `status` flag on `User`). Edits landed in `PRD.md` (§5.2 + §10 OQ-H + glossary), `FEATURES.md` (§2 + §7), `DYNAMODB_DATA_MODEL.md` (§13.1.8 OQ-H), and the memory bank (projectbrief, systemPatterns, techContext, progress, this file). **Next:** work through the open questions (OQ-A/B/C/E/F/G, then OQ-H) one by one; TRD still in the pipeline (settles OQ-E/OQ-F).

## Prior Focus (as of 2026-07-27)

> ✅ **Trade Price Chart with Transaction Markers added to Phase 1 (FR-H5 / §5.12 / ADR-014 / OQ-E).** On an **equity** trade's detail (Stock/ETF only), show that ticker's historical price line with a **circle marker per user buy/sell** (green=buy, red=sell; tooltip: type·date·price·qty). Locked decisions: (1) historical series via a **new ephemeral `PRICEHIST#<canonicalSymbol>#<exchange>` cache** (§9.6, sibling of the price cache, ADR-008 family) — **lazy fetch + 1-day freshness** (reuse if `fetchedDate`=today, else re-fetch once); (2) chart scoped to the **opened trade's ticker + market/currency** — markers span all the user's accounts on that market (reuse **AP-30/GSI3**, filter by currency in app), dual-listed tickers get one chart per market; (3) **Stock+ETF only**, else fallback message; (4) **Phase 1 shows only factual buy/sell markers — no P/L**. Realized P/L on sell markers (FIFO vs avg-cost TBD) + triangle markers + profit/loss colouring are **deferred to Phase 2**. New: **AP-31/AP-32** (§4.9), **§9.6** cache, **§10.7** chart mechanism, **ADR-014**, **OQ-E** (§13.1.7 — historical-price provider/range to finalize). Edits: `FEATURES.md` (§5.12 + narrowed §6 + §7 OQ note), `PRD.md` (FR-H5 §7.4 [Should], §4.2/§9/§10 OQ-E/§11 backlog), `DYNAMODB_DATA_MODEL.md` (§1.5, §4.9, §5 ADR-014, §9.6, §10.7, §12.1, §13.1.7). Memory bank updated. Non-goals were **narrowed not removed** (charts→analytics dashboards; P&L→tax-grade). No new durable item type.

## Prior Focus (as of 2026-07-25)

> ✅ **Auth pivot: Amazon Cognito → self-managed OAuth 2.0 (ADR-013 rewritten).** Session 12 replaced the Cognito decision with **self-managed OAuth 2.0 / OIDC** — **"Sign in with Google"** in Phase 1, **"Sign in with Zerodha"** in Phase 2. The deciding factor: Zerodha (Kite Connect) is a bespoke broker login, not a standards-compliant OIDC IdP that Cognito federates cleanly, so a Cognito path would fragment auth into two mechanisms. We now **run the OAuth flow ourselves**: verify the provider's token against its JWKS (Google), mint our **own internal `userId`**, and map external identities via a new **AuthIdentity** lookup item (`AUTH#<provider>#<sub>` → `userId`, §7.12 — a non-user-rooted system item like `GLOBAL#SYMBOLMAP`, written idempotently). `role` (`user`/`admin`) is **app-managed** on the `User` item; **no passwords**, and no email-verification/password-reset (the identity provider owns identity); MFA is the provider's concern. **OQ-D is resolved** → first-login provisioning. Two new open questions: **OQ-F** (session/token strategy — we own the session; mechanism deferred to the TRD) and **OQ-G** (Phase-2 Google↔Zerodha account-linking). Edits landed across `DYNAMODB_DATA_MODEL.md` (ADR-013, §7.1, new §7.12 AuthIdentity, §4.1 AP-2b/2c, §6.5, §7.11, §11, §12.1/§12.2, §13.1.4/5/6, §13.2 A-9), `FEATURES.md` (§5.11 + §7), `PRD.md` (§6/§7.1/§9/§10/§11/§12), and the memory bank. Cognito is now the **rejected alternative** in ADR-013. FR-H5 chart / historical price / OQ-E remain deferred; the TRD is not written until the PRD is approved.

> ✅ **The DynamoDB data model (`DYNAMODB_DATA_MODEL.md`) is COMPLETE** — all 13 sections written across 8 reviewed batches, with the final consistency pass applied (Session 9). ✅ **`systemPatterns.md` and `techContext.md` have now been rewritten for DynamoDB** (2026-07-10), replacing the retired PostgreSQL content. The memory bank is now fully consistent with the DynamoDB model. Recommended next workstream: implementation (backend language/framework, data-access layer, parsers, import pipeline, XIRR, price cache).

### Authoring a Fresh DynamoDB-Native Data Model (COMPLETE)

The project is **pivoting its database from PostgreSQL to DynamoDB**. We are designing the
database from scratch as a **NoSQL-native (DynamoDB) data model**, derived **purely from
`FEATURES.md`** — using an access-pattern-first methodology rather than translating the
existing relational schema.

The output is a single new document: **`DYNAMODB_DATA_MODEL.md`** at the repo root, written
**incrementally** in reviewed batches.

### Critical Ground Rules for This Effort

1. **FEATURES.md is the ONLY input.** The design is built fresh from the feature
   requirements. We deliberately do **not** consult `DATA_MODEL.md`,
   `DATA_MODEL_ANALYSIS.md`, or `DB_ALTERNATIVES_ANALYSIS.md` while designing — they
   describe the retired relational design and would bias the NoSQL model.
2. **This is a replacement, not an experiment.** DynamoDB is the real target database.
   The PostgreSQL 11-table design is **superseded** and kept only as historical reference.
3. **Access-pattern-first.** No entity, key, or index exists unless a feature/query in
   FEATURES.md demands it.
4. **Per-user data isolation is a first-class constraint** — every key is rooted at the user.

---

## Locked Decisions for the DynamoDB Model

| Setting                | Value                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Output destination** | Single new doc — `DYNAMODB_DATA_MODEL.md` at repo root (append-only; **no per-batch files**)                                                                                                    |
| **Source of truth**    | `FEATURES.md` only                                                                                                                                                                              |
| **Architecture**       | **Pragmatic mix** — one main single-table (`BeyondFolio`) + a separate TTL-driven price-cache table                                                                                             |
| **Design philosophy**  | Access-pattern-first; per-user isolation rooted in every key; denormalization + idempotency mindset                                                                                             |
| **Rationale capture**  | Dedicated **Design Decisions & Rationale (ADR)** section + inline "why" callouts cross-referencing decision records — acts as a do's/don'ts reference to prevent revisiting rejected approaches |
| **Depth**              | Includes concrete example items (real PK/SK JSON shapes)                                                                                                                                        |
| **Execution style**    | **Batch-by-batch** — write a batch → stop & inform → wait for feedback → revise or proceed to next batch                                                                                        |

---

## Document Skeleton (13 Sections)

1. Introduction & Scope
2. Design Principles
3. Entities & Relationships (Conceptual)
4. Access Patterns Catalog
5. Design Decisions & Rationale (ADRs)
6. Table Design Overview
7. Main Table — Item Definitions
8. Global Secondary Indexes (GSIs)
9. Auxiliary Table — Price Cache
10. Handling the Tricky Requirements
11. Example Items (Sample Data)
12. Access Pattern → Implementation Mapping
13. Open Questions & Assumptions

---

## Batch Plan & Status

| Batch | Sections                                                 | Status             |
| ----- | -------------------------------------------------------- | ------------------ |
| 1     | §1 Introduction & Scope · §2 Design Principles           | ✅ Done (reviewed) |
| 2     | §3 Entities & Relationships · §4 Access Patterns Catalog | ✅ Done (reviewed) |
| 3     | §5 Design Decisions & Rationale (ADRs)                   | ✅ Done (reviewed) |
| 4     | §6 Table Design Overview                                 | ✅ Done (reviewed) |

| 5 | §7 Main Table — Item Definitions · §8 GSIs | ✅ Done (reviewed) |
| 6 | §9 Auxiliary Table — Price Cache · §10 Handling the Tricky Requirements | ✅ Done (reviewed) |

| 7 | §11 Example Items · §12 Access Pattern → Implementation Mapping | ✅ Done (reviewed) |
| 8 | §13 Open Questions & Assumptions + full-document consistency pass | ✅ Done — **DOCUMENT COMPLETE** |

**Workflow per batch:** write the batch → append to `DYNAMODB_DATA_MODEL.md` → stop and
inform the user → wait for feedback → if approved, proceed to next batch; if not, discuss,
decide, revise, and re-review.

---

## Requirements That Must Survive the Pivot

These requirements are encoded in FEATURES.md (and were previously implemented relationally).
Their _relational implementations_ (FKs, unique constraints) do **not** carry over, but the
_requirements themselves_ must be satisfied by the DynamoDB design:

1. **Per-user data isolation** — a user never sees another user's data.
2. **Two-layer deduplication** — (a) same file not imported twice; (b) same trade not
   recorded twice.
3. **Multiple journal entries per trade**, and **multiple tags per journal entry** (many-to-many).
4. **Tag scorecard atomic win/loss counters** — updated on each prediction evaluation.
5. **Prediction evaluation** → Win / Loss / Breakeven, user-triggered.
6. **Corporate-action symbol resolution** — old symbols map to current equivalents.
7. **Multi-account & multi-currency** (USD + INR, no conversion in Phase 1).
8. **XIRR** — needs all cashflows (deposits, withdrawals, buys, sells, dividends, fees) +
   current holding value per user/currency.
9. **Price cache with short TTL** — for valuation and evaluation.

---

## Superseded / Historical Context

The following prior effort is now **moot** and retained only for history:

- **Polyglot Persistence Evaluation** (`DB_ALTERNATIVES_ANALYSIS.md`) — a table-by-table
  analysis of whether individual PostgreSQL tables could move to NoSQL. Since the project is
  now going **all-in on DynamoDB**, this per-table "keep in PG vs move" question no longer
  applies. The doc remains as a record of the reasoning that led here.
- The **PostgreSQL 11-table relational design** (`DATA_MODEL.md`,
  `DATA_MODEL_ANALYSIS.md`) is **superseded** by the new DynamoDB model.

---

## Latest Session Summary

**2026-07-25 (Session 12) — Auth pivot: Cognito → self-managed OAuth 2.0 ✅**

- **Decision:** replaced Amazon Cognito with **self-managed OAuth 2.0 / OIDC** — "Sign in with Google" (Phase 1), "Sign in with Zerodha" (Phase 2). Zerodha's bespoke Kite Connect login doesn't federate cleanly through Cognito, which would fragment auth; running the flow ourselves keeps **one uniform multi-provider pattern**. Cognito is now the **rejected alternative** in ADR-013.
- **New model piece — AuthIdentity (§7.12):** a login-lookup item `PK = AUTH#<provider>#<providerSub>`, `SK = AUTH`, holding `userId` — maps a provider's stable `sub` to our **own internal `userId`**. Non-user-rooted (like `GLOBAL#SYMBOLMAP`); written idempotently (`attribute_not_exists`); a second AuthIdentity → same `userId` is the Phase-2 account-linking mechanism.
- **`User` item:** `userId` is now our internal id (not the provider `sub`); `role` (`user`/`admin`) is **app-managed** (not a provider claim); `email`/`displayName` provider-supplied; no password; created on **first login**.
- **Access patterns:** AP-2b reworded (verify Google OIDC id_token against JWKS — upstream, no table op); new **AP-2c** (`GetItem AUTH#<provider>#<sub>` → `userId`; first login creates User + AuthIdentity).
- **Open questions:** **OQ-D resolved** → first-login provisioning; **OQ-F** added (session/token strategy — we own the session, mechanism deferred to TRD); **OQ-G** added (Phase-2 Google↔Zerodha account-linking).
- **Edits:** `DYNAMODB_DATA_MODEL.md` (ADR-013 rewritten, §7.1, new §7.12, §4.1 AP-2b/2c, §6.5 forward-map, §7.11 summary, §11 examples, §12.1/§12.2, §13.1.4/5/6, §13.2 A-9); `FEATURES.md` (§5.11 + §7 OQ-F/OQ-G); `PRD.md` (§6 scope, §7.1 FR-A1…A6, §9 dependency, §10 OQ table, §11 backlog, §12 glossary); memory bank (`systemPatterns.md`, `techContext.md`, `productContext.md`, `projectbrief.md`, `progress.md`, this file). **README** unchanged (navigation index). FR-H5 chart / historical price / OQ-E stay deferred; TRD unwritten until the PRD is approved.
- **Recommended next:** get PRD sign-off, then write the TRD (which will settle OQ-F session/token strategy and the OAuth library choice).

**2026-07-10 — Memory-bank rewrites: `systemPatterns.md` + `techContext.md` → DynamoDB ✅**

- Rewrote **`systemPatterns.md`** for the DynamoDB single-table design (sourced from `DYNAMODB_DATA_MODEL.md`): the two tables, key structure (`USER#<userId>` rooting, `TYPE#identifier` SKs, `entityType`, the `GLOBAL#SYMBOLMAP` exception), the 10 item types with PK/SK/APs, the 2 GSIs, DynamoDB-era invariants, denormalizations, the 12 ADRs, grouped access patterns, tricky-requirement mechanisms, and the OQ-A/B/C soft spots. Removed the ⚠️ SUPERSEDED banner.
- Rewrote **`techContext.md`** for the DynamoDB stack: engine (Amazon DynamoDB, two tables), why-DynamoDB reasons, key mechanisms (composite PK/SK, sparse GSIs, conditional writes, atomic `ADD`, TTL, time-ordered SKs), external deps (Yahoo/NSE → price cache; broker files → import), security posture, assumptions A-1…A-8, open questions OQ-A/B/C, AWS-native deployment (DynamoDB Local for dev, on-demand + PITR for prod), and still-undecided implementation choices.
- Updated **`README.md`** — pivot banner flipped to ✅ complete; Reading Order rows 3 & 4 now show both files as current DynamoDB docs; SoT row for `DYNAMODB_DATA_MODEL.md` marked complete.
- The memory bank is now **fully consistent** with the DynamoDB model — no remaining ⚠️ SUPERSEDED memory-bank files.
- **Recommended next:** begin implementation planning (backend language/framework, data-access layer, parsers per broker, import pipeline, XIRR engine, price-cache refresh, Evaluate flow).

**2026-06-26 (Session 9) — Batch 8 (FINAL) written — DOCUMENT COMPLETE ✅**

- **Batch 7 confirmed approved by the user** at the start of the session (§11/§12 promoted to ✅ Done (reviewed)).
- **§13 Open Questions & Assumptions** appended (dual-audience style — "In plain terms" opener + glosses), with an upfront **"no new decision IDs"** note (the doc's ADRs + §13 are the single source of truth; the relational-era OQ-006/OQ-007 are reference-only).
  - **§13.1 Open Questions** — the three §10.6/§11.14 items formalized as structured blocks (_what it is · where it bites · current Phase-1 disposition · proposed Phase-2 direction_): **OQ-A** identical same-day transfers collapsing on one deterministic `cashflowId` (accepted, ADR-005; Phase-2 = disambiguating key component); **OQ-B** Zerodha F&O open/close ambiguity affecting derived holdings/XIRR (AP-14/§10.2; Phase-2 = execution-time-ordered position tracker, no schema change); **OQ-C** DRIP record pattern varies by broker (unverified; Phase-2 = verify against real broker files).
  - **§13.2 Assumptions** — an 8-row table (Assumption · Relied on at · Anchored by): A-1 tag-name stability, A-2 holdings derived not stored, A-3 per-currency XIRR/no conversion, A-4 canonical symbol resolution available, A-5 cache freshness window is app config, A-6 ID formats illustrative, A-7 exchange known/derivable for price key, A-8 per-user isolation sufficient for Phase 1.
- **Full-document consistency pass done:** fixed the long-standing auto-formatter stray blank lines in the **Section Index table** (now one clean 13-row table); **flipped all 13 Section Index rows to ✅** (normalized "Drafted" → "✅", §13 → ✅); added a first-use **denormalize** gloss in §2.4 (the §1–§4 jargon sweep — the rest of §1–§4 already carried glosses); verified cross-references (AP-N, ADR-NNN, § pointers), key-shape consistency across §6/§7/§8/§9/§11/§12, the cashflow sign convention, and canonical-symbol usage; confirmed **no references to the retired relational docs**.
- **The DynamoDB data model is now COMPLETE** — all 13 sections written and the consistency pass applied. Per standing preference, the doc was **not** auto-opened on completion.
- **Recommended follow-up (next session):** full DynamoDB rewrites of `techContext.md` (engine → DynamoDB; remove the PostgreSQL lock) and `systemPatterns.md` (single-table design patterns) — both still carry "⚠️ SUPERSEDED" banners and were deferred until the model was complete.

**2026-06-26 — Batch 7 written (§11 Example Items · §12 AP→Implementation Mapping), awaiting review**

- **Batch 6 confirmed approved by the user** at the start of the session (§9/§10 promoted to ✅ Done (reviewed)).
- **User expanded §11 scope before writing:** more examples grounded in FEATURES.md, **two users**, **all three brokers** (incl. Robinhood), broad instrument coverage, and **worked limitation examples shown as records** with explanations.
- **§11 Example Items** appended as one coherent worked scenario: **`u_alex`** (US — Robinhood USD + a Fidelity import spanning **three accounts**: Individual/Roth/401k, §5.10) and **`u_priya`** (India — Zerodha INR). Sub-sections: §11.1 the cast; §11.2 User profiles; §11.3 five Accounts; §11.4 ImportedFiles (incl. the **multi-file Zerodha** equity/F&O/P&L upload); §11.5 Trades spanning **Stock (FB→META, exercising ADR-010), ETF, fractional share, US Option, MutualFund/MoneyMarket, 401k allocation, Indian equity, NIFTY IndexOption**; §11.6 Cashflows — **all six types, both currencies, §10.2 signs** (DEPOSIT/BUY/FEE negative, WITHDRAWAL/SELL/DIVIDEND positive), BUY/SELL legs carry `relatedTradeId`; §11.7 two JournalEntries on the META trade (multiple-entries + multiple-tags cases, one WIN one LOSS); §11.8 three Tags; §11.9 three JournalTagLinks with `GSI2PK`/`GSI2SK`; §11.10 TagScorecards matching the evaluations; §11.11 global SymbolMapping (`SYMBOL#Fidelity#FB`→META); §11.12 three PriceCache items (one deliberately **expired** for the §11.14 demo); §11.13 **partition view** (SK-ordered listings of both users' partitions); §11.14 **limitation examples as records** — (1) identical same-day Robinhood deposits colliding on the same `cashflowId`, (2) Zerodha F&O open/close ambiguity, (3) DRIP dividend+companion-buy — each with explanation, all carried to §13.
- **§12 Access Pattern → Implementation Mapping** appended: §12.1 a **full AP-1…AP-29 table** (Operation · Table/Index · exact key condition / `begins_with` prefix · ADRs), §12.2 **index-utilization read-back** proving GSI1 serves only AP-11, GSI2 only AP-21, price-cache AP-28/29, AP-14 derived (no structure), no orphan indexes — closing the §4.9/§8.3 loop.
- Flipped §11 & §12 **Section Index** rows to ✅ Drafted. Dual-audience style maintained throughout. Internal consistency verified (link entryIds ↔ entries; scorecard counters ↔ evaluations; SymbolMapping canonical ↔ trade `symbol`; cashflow signs ↔ §10.2).
- **Open formatting nit (still pending):** auto-formatter's stray blank lines inside the Section Index / batch tables remain; clean up in the Batch 8 pass.
- **Next step:** after user review of Batch 7, write **Batch 8 (§13 Open Questions & Assumptions + full-document consistency pass)** — the final batch.

**2026-06-25 — Batch 6 written (§9 Price Cache · §10 Tricky Requirements), awaiting review**

- **Two open modeling choices confirmed with the user before writing:**
  1. **§9 price-cache key shape** = single partition key, **no sort key**: `PK = PRICE#<canonicalSymbol>#<exchange>` (e.g. `PRICE#META#NASDAQ`, `PRICE#INFY#NSE`). Keyed by the **canonical** (post-resolution, ADR-010) symbol; `exchange`/market folded into the key to disambiguate same-ticker-different-market. Tiny projection: `price`, `currency`, `asOf` (source timestamp), `expiresAt` (the TTL attribute, **epoch seconds**), `entityType="PriceCache"`. Read rule = **treat expired-but-not-yet-deleted as missing** (TTL deletion lags, so re-check freshness in code). Cache write is a plain **last-write-wins overwrite** (NOT a conditional/idempotent write — re-fetching a price is desirable, unlike imports).
  2. **§10 cashflow `amount` sign convention** (resolves the §7.5 deferral) = **investor's perspective**: cash _into_ investments is **negative** (`DEPOSIT`, `BUY`, `FEE`); cash _back to the user_ is **positive** (`WITHDRAWAL`, `SELL`, `DIVIDEND`); the **derived terminal holdings-valuation cashflow** (dated today) is **positive**.
- **§9 Auxiliary Table — Price Cache** appended: §9 intro (why a separate global/ephemeral table, ADR-003/008), §9.1 purpose & lifecycle (never a system of record, can be emptied anytime), §9.2 key shape + attribute table + "why this key" callout, §9.3 the TTL attribute & auto-expiry, §9.4 the expired-as-missing read rule, §9.5 serving AP-28 (GetItem) / AP-29 (PutItem with `expiresAt = now + cacheWindow`).
- **§10 Handling the Tricky Requirements** appended, one subsection per hard requirement: §10.1 two-layer dedup (file hash + deterministic trade/cashflow ids via `attribute_not_exists`, ADR-005/011); §10.2 XIRR assembly (per-currency cashflow prefix query AP-13 + **deriving current holdings from Trade records** for the terminal valuation cashflow AP-14, ADR-007/009/001) incl. the full **sign-convention table**; §10.3 multi-account (GSI1) & multi-currency (currency-first SK) isolation; §10.4 many-to-many journal↔tags + evaluation→atomic scorecard counter flow (ADR-004/006/010); §10.5 corporate-action symbol resolution at import/valuation/evaluation (ADR-010/012); §10.6 a limitations table surfacing the three FEATURES.md §7 items (identical same-day Robinhood transfers collapsing under the dedup key; Zerodha F&O open/close ambiguity; DRIP reporting) — all flagged as feeding §13.
- Flipped §9 & §10 **Section Index** rows to ✅ Drafted. Dual-audience style maintained (each section opens "In plain terms"; TTL re-glossed; GSI/sparse/idempotent glosses reused).
- **Open formatting nit (still pending):** auto-formatter's stray blank lines inside the Section Index / batch tables remain; clean up in the Batch 8 pass.
- **Next step:** after user review of Batch 6, write **Batch 7 (§11 Example Items · §12 Access Pattern → Implementation Mapping)**.

**2026-06-23 (later) — Batches 4 & 5 written and reviewed**

- **Batch 4 (§6 Table Design Overview)** appended to `DYNAMODB_DATA_MODEL.md` — the bird's-eye physical layout: §6.1 the two tables at a glance (durable per-user `BeyondFolio` vs ephemeral global price cache, with purpose/ownership/lifecycle/contents + driving ADRs), §6.2 composite `PK`/`SK` structure rooted at `USER#<userId>`, §6.3 item-type overloading + the `entityType` attribute, §6.4 the global `GLOBAL#SYMBOLMAP` partition (the one deliberate exception, ADR-012), and §6.5 a forward map of what lives where + a GSI preview. Dual-audience style applied from the start.
- **Batch 5 (§7 Main Table Item Definitions · §8 GSIs)** appended — concrete `PK`/`SK` shapes + attribute tables (with a **"Denorm?"** column flagging denormalized copies) for all **10 item types** (User, Account, ImportedFile, Trade, Cashflow, JournalEntry, Tag, JournalEntry↔Tag link, TagScorecard, SymbolMapping), a §7.11 item-type summary table, and exactly **two GSIs** — GSI1 (Trades by account → AP-11) and GSI2 (Journal entries by tag → AP-21), both user-scoped to preserve isolation. §8.3 proves every other read pattern is served by the base table (no over-indexing).
- **Four key-shape decisions confirmed with the user before writing §7/§8:**
  1. **Tag identity = name** (`TAG#<tagName>`) — idempotent create; accepted trade-off that renaming is non-trivial (names treated as stable in Phase 1).
  2. **Journal↔Tag many-to-many** = link items (`JTAG#<tagName>#<entryId>`) + **tag names denormalized onto the JournalEntry** (so AP-17 is one read) + **GSI2** for the tag→entries reverse lookup.
  3. **Current holdings (AP-14) stays DERIVED** from Trade records — there is intentionally **no Holdings item** (out of scope §1.5); derivation to be described in §10.
  4. **Cashflow currency-in-the-sort-key** (`CASHFLOW#<currency>#<date>#<id>`) serves AP-13 entirely from the base table — **no cashflow GSI**.
- **Key shapes locked (for later sections to stay consistent):** User `SK=PROFILE`; Account `SK=ACCOUNT#<id>`; ImportedFile `SK=FILE#<contentHash>`; Trade `SK=TRADE#<date>#<tradeId>` (tradeId = deterministic hash of account+canonical symbol+datetime+side+qty+price); Cashflow `SK=CASHFLOW#<currency>#<date>#<id>`; JournalEntry `SK=TRADE#<tradeId>#JOURNAL#<entryId>`; Tag `SK=TAG#<tagName>`; link `SK=JTAG#<tagName>#<entryId>`; TagScorecard `SK=TAGSCORE#<tagName>` (wins/losses/breakeven atomic counters); SymbolMapping `PK=GLOBAL#SYMBOLMAP`, `SK=SYMBOL#<broker>#<rawSymbol>`. Trade keeps both `symbol` (canonical) and `rawSymbol` (as-imported).
- **New standing preference:** **do not auto-open `DYNAMODB_DATA_MODEL.md`** on completion — the user opens it manually (so `attempt_completion` should not pass an `open` command for it).
- **Open formatting nit (still pending):** the auto-formatter's stray blank lines inside the Section Index / batch tables remain; clean up in the Batch 8 pass.
- **Next step:** write **Batch 6 (§9 Auxiliary Table — Price Cache · §10 Handling the Tricky Requirements)**, continuing the dual-audience style.

**2026-06-23 — Batch 3 written + dual-audience readability pivot**

- **Batch 3 (§5 Design Decisions & Rationale)** written into `DYNAMODB_DATA_MODEL.md` — all twelve records **ADR-001 … ADR-012** formalized in a consistent format (Context / Decision / Consequences (trade-offs) / Alternatives rejected / Driven by, plus a Related ADRs line where decisions interlock). ADR-001…010 align 1:1 with the §2 principles; ADR-011 (Trade vs Cashflow are separate concepts) and ADR-012 (SymbolMapping is global/admin-owned) authored fresh. Section Index row for §5 flipped to ✅ Drafted.
- **Readability pivot (important new convention):** the user found §5 too jargon-heavy and set the standard that **the document must be readable by both a developer _and_ a business stakeholder.** We did NOT strip the precise technical terms (developers need them) — instead we **layered** each ADR:
  - every ADR now opens with an **"In plain terms"** line — one jargon-free sentence stating the decision and why it matters (a business reader can stop there and still get it);
  - the fuller fields were reworded to **lead with the idea, then name the mechanism**;
  - **unavoidable technical terms are glossed on first use** (e.g. idempotent = safe to repeat; denormalize = store a copy in more than one place; partition key = the "folder" an item is filed under; sort key = the filing label; TTL = database auto-deletes after a set time; atomic "add one" for counters).
  - Added a **"How to read an ADR"** note at the top of §5 explaining the layering and who each part is for.
- **New writing convention going forward:** apply this same **plain-terms-first + first-use-gloss** style to §6–§12 as they are written; **sweep §1–§4** for any stray jargon during the **Batch 8 consistency pass**.
- **Decision-logging policy unchanged:** ADR-011/012 (and all ADRs) live ONLY in `DYNAMODB_DATA_MODEL.md` as the single source of truth — not duplicated as new D-IDs in `progress.md`.
- **Open formatting nit (still pending):** the auto-formatter's stray blank line inside the Section Index table remains; clean up in the Batch 8 pass.
- **Next step:** write **Batch 4 (§6 Table Design Overview)**, applying the dual-audience readability style from the start.

**2026-06-22 — Batches 1 & 2 written and reviewed**

- **Batch 1 (§1 Introduction & Scope, §2 Design Principles)** written into `DYNAMODB_DATA_MODEL.md`.
  - §1 includes a self-contained product-context paragraph + a methodology note ("fresh,
    access-pattern-first; FEATURES.md wins on any conflict") + a document-conventions block.
  - §2 holds 10 design principles, each restated as **ADR-001…ADR-010** references.
- **§2 styling decision:** reworked each principle into a **balanced `Do:` / `Don't:` colon-label
  format** (the colon makes "Do" read as a label, not a bare-verb sentence), keeping the _Driven by_
  and _Why (ADR)_ bullets. Added a §2 purpose line. **New writing convention:** no hard line wraps —
  each paragraph/bullet is one continuous line so the Markdown preview fills the page width.
- **Concept clarification before §3:** confirmed the NoSQL "**entities ≠ tables**" idea — ~11 domain
  _concepts_ collapse into **2 physical tables** (main `BeyondFolio` + price cache) via key prefixes,
  not 1-table-per-entity. §3 opens with a banner stating this.
- **Batch 2 (§3 Entities & Relationships, §4 Access Patterns Catalog)** written.
  - §3: 11 entities with a "Materializes as" column, a "what we did NOT model" list, a relationships
    table (realized via co-location/denormalization, not FKs), and a text conceptual map.
  - **Two DynamoDB-era modeling decisions confirmed** (live only as ADRs in the data-model doc —
    single source of truth; not duplicated into the D-ID log):
    - **ADR-011 — Trade vs Cashflow are separate concepts:** a buy/sell is both a Trade (history,
      §5.3) and a cashflow (XIRR, §5.4); deposits/withdrawals/dividends/fees are cashflows only.
    - **ADR-012 — SymbolMapping is global/admin-owned:** the one deliberate exception to per-user
      rooting (a ticker change is a shared market fact maintained by an admin, §5.9).
  - §4: access-pattern catalog **AP-1 … AP-29**, grouped by area, each traced to a FEATURES.md
    feature and marked Read/Write; keys deferred to §12.
- **Open formatting nit:** the auto-formatter keeps nudging a stray blank line into Markdown tables;
  to be cleaned in the Batch 8 consistency pass.
- **Next step:** write **Batch 3 (§5 Design Decisions & Rationale)** — formalize ADR-001 … ADR-012.

**2026-06-17 — DynamoDB Pivot, Planning**

- Decided to design the database fresh as a **DynamoDB-native model** derived **only from
  FEATURES.md** — confirmed as a **replacement** for PostgreSQL (not a parallel exploration).
- Agreed the architecture: **pragmatic mix** (main single-table + separate price-cache table).
- Agreed the **13-section document skeleton**, including a dedicated **ADR / rationale**
  section + inline "why" callouts so the doc doubles as a do's/don'ts reference.
- Agreed **8-batch incremental workflow** with a review gate, all appended into one file
  `DYNAMODB_DATA_MODEL.md`.
- Updating the memory bank to reflect the pivot before writing Batch 1.
- **Next step:** write Batch 1 (§1 Introduction & Scope · §2 Design Principles), then stop
  for review.

**Prior sessions (relational era):** see `progress.md` Session History.
