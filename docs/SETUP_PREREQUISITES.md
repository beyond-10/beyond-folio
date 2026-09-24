# Beyond Folio — Setup Prerequisites

> **What this file is.** A checklist of the external accounts, credentials, DNS, tooling, and content a developer/operator must have in place to implement and deploy Phase 1. It does **not** re-decide anything — it inventories what the TRD, data model, and `PHASE_1_BACKLOG.md` already require. Step-by-step provider setup instructions are out of scope (those live in per-task work or the first-admin runbook, E13-T3).

> **How to use it.** Items are grouped by the **epic that first needs them**, mirroring the backlog's just-in-time approach — set each up right before it becomes blocking, not all upfront. **Nothing in Tiers B–F blocks starting `E1-T1`** — you can scaffold the monorepo and CDK today (see "Safe to start now" at the bottom) while lining up cloud/domain access in parallel.

> **Cross-reference conventions.** `E<n>-T<n>` = task in `PHASE_1_BACKLOG.md` · `TRD §N` = Technical Requirements Document · `ADR-NNN` = `DYNAMODB_DATA_MODEL.md` §5.

---

## Tier A — Local development (needed to start immediately)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **Node.js** (pinned LTS version) | E1-T1 | Runtime for the whole stack; version pinned via `.nvmrc`/`engines` (TRD §3.1). |
| ☐ | **Package manager — npm *or* pnpm** (pick one) | E1-T1 | Monorepo workspaces. TRD §3.1 allows either; decide once for consistency (see "Choices to pin"). |
| ☐ | **Docker** | E1-T3 | Runs DynamoDB Local + LocalStack for local/CI without touching real AWS (TRD §8.3). |
| ☐ | **AWS CLI** | E1-T3 | Local bootstrap, manual verification, first-admin runbook. |
| ☐ | **AWS CDK CLI** | E1-T2 | `cdk synth` / `cdk deploy` (TRD §8.1). |
| ☐ | **Git** | E1-T1 | Version control; branch protection on `main` (Tier B). |

---

## Tier B — Cloud foundation (needed to deploy anything)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **AWS account** + chosen **region** | E1-T3 | All infrastructure deploys here; region is a CDK context value. |
| ☐ | **CDK bootstrap** on the account/region | E1-T4 (first deploy) | One-time `cdk bootstrap` so CloudFormation can deploy stacks. |
| ☐ | **GitHub repository** | E1-T1 | Source of truth; hosts the Actions CI/CD pipeline. |
| ☐ | **GitHub ↔ AWS OIDC trust role** | E1-T4 | Gate-less CD assumes this role to deploy — **no long-lived AWS keys** in CI (TRD §8.4). |
| ☐ | **Branch protection on `main`** (require PR review + green CI) | E1-T4 | The pre-merge gate that compensates for gate-less CD (TRD §8.4). |

---

## Tier C — Public launch (needed to go live on the domain)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **Owned domain** | E2-T4 | ✅ Already owned. The public site + waitlist go live here. |
| ☐ | **DNS control / hosted zone** for the domain | E1-T5, E2-T4 | To point the domain at the CloudFront distribution created by OpenNext. |
| ☐ | **ACM certificate** for the domain | E1-T5, E2-T4 | HTTPS for the site. **Note:** CloudFront requires the cert in **`us-east-1`** regardless of the app's primary region. |

---

## Tier D — Authentication (needed for sign-in)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **Google Cloud project** | E4-T2 | Hosts the OAuth 2.0 / OIDC client (ADR-013, TRD §5.1). |
| ☐ | **Google OAuth 2.0 client** (client id + secret) | E4-T2 | Runs "Sign in with Google" authorization-code flow. |
| ☐ | **Authorized redirect URIs** configured | E4-T2 | Must include the deployed callback URL(s) (and local dev URL) or the OAuth flow fails. |
| ☐ | **Asymmetric JWT keypair** (RS256/ES256) generated | E4-T1 | Private signing key for `auth-api` only; public verify key for the other Lambdas (TRD §5.6). |
| ☐ | **SSM SecureString parameters** created | E4-T1 | Store the OAuth client secret + JWT private key; read via `getSecret()` (TRD §7.4, E5-T4). |


## Tier E — Market data (needed for live prices)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **Market-data providers (OQ-E) — RESOLVED** | E11-T1 | **Decided: INR → Zerodha Kite API, USD → Twelve Data**, routed by currency. Kite covers NSE/BSE current + historical (needs paid historical add-on + user Kite session); Twelve Data covers NYSE/NASDAQ (needs API key). Both stored as SSM SecureString. |
| ☐ | **Provider API key(s)** obtained | E11-T3 | Concrete adapter(s) authenticate with these; stored as SSM SecureString (extends E4-T1's pattern). |

> XIRR (E8), Evaluate (E9), and the chart (E10) are built against the price-cache and degrade gracefully when a price is missing — so they can be implemented **before** the provider exists. Live end-to-end pricing only requires Tier E at E11.

---

## Tier F — Operations & first admin (needed for production readiness)

| ☐ | Item | Needed before | Why |
|---|------|---------------|-----|
| ☐ | **SNS alarm subscription** (operator email or channel) | E13-T4 | Receives DLQ-depth and error-rate alarms — the production smoke detector for no-staging + gate-less CD (TRD §9.3). |
| ☐ | **First-admin Google account** identified | E13-T3 | The person who signs in first and is manually promoted to `admin` via the runbook (one-time DynamoDB edit; TRD §8.5). |

---

## Secrets & configuration inventory

Every secret the system reads, where it lives, and when. **All secrets are SSM SecureString parameters read through the shared `getSecret()` helper (E5-T4); none are ever committed to the repo or logged (TRD §9.2).**

| ☐ | Secret / config | Consumer | Provisioned in | Notes |
|---|-----------------|----------|----------------|-------|
| ☐ | Google OAuth **client secret** | `auth-api` | E4-T1 | Client id may be non-secret config; secret is SecureString. |
| ☐ | JWT **private signing key** | `auth-api` only | E4-T1 | IAM-scoped so no other Lambda can read it (sole-issuer boundary). |
| ☐ | JWT **public verification key** | all 4 API Lambdas | E4-T1 / E5-T1 | Distributed as plain env var (not secret). |
| ☐ | Market-data **API key(s)** (Kite + Twelve Data) | market-data module (`app-api`, `import-worker`) | E11-T1/T3 | INR → Kite (paid historical add-on), USD → Twelve Data. |
| ☐ | Env config (table/bucket/queue names, region, domain, freshness windows) | all | CDK context (E1-T2) | Non-secret; differs per environment, same CDK definitions. |

> **Never-commit rule:** no `.env` with real values in git. Provide a committed **`.env.example`** (created in E1) listing variable *names* only.

---

## Product-content decisions (your call — non-technical)

These are not engineering blockers but are needed before the public site can ship. Decide them before **E2-T3** (waitlist form UI) and **E2-T1** (landing content).

| ☐ | Decision | Needed before |
|---|----------|---------------|
| ☐ | **Product name / tagline** shown on the landing page | E2-T3 |
| ☐ | **Landing-page copy** — what Beyond Folio does, in marketing terms (the backlog specifies the *form*, not the words) | E2-T3 |
| ☐ | **Basic branding** — logo, colors (minimal is fine for launch) | E2-T3 |
| ☐ | **Waitlist confirmation wording** — success message, "already on the list" message | E2-T2/T3 |

---

## Early implementation choices to pin (decide once, at E1)

The backlog deliberately leaves some developer-level choices open (the TRD is the authority). Pin these early so E1 sets them up consistently:

| ☐ | Choice | Guidance |
|---|--------|----------|
| ☑ | **Package manager** — **DECIDED: pnpm** (workspaces) with **`node-linker=hoisted`** | Chosen (2026-09-23) for fast/disk-efficient installs and first-class monorepo ergonomics (`--filter`, `workspace:*`, dependency-aware + changed-since-git selectors). Add `node-linker=hoisted` in root `.npmrc` so `node_modules` is laid out flat (npm-style) — this keeps CDK/OpenNext + esbuild Lambda bundling trouble-free (avoids symlink "module not found" at build time). Trade-off accepted: hoisted mode relaxes pnpm's strict phantom-dependency checking. Reproducible builds via committed `pnpm-lock.yaml`. Pin the pnpm version via Corepack (`packageManager` field in root `package.json`). |
| ☑ | **Test runner** — **DECIDED: Vitest** | Chosen (2026-09-23) over Jest: native ESM + TypeScript with near-zero config, fast (esbuild transform), Jest-compatible API. Fits the mostly-pure-logic suite (XIRR, normalization, dedup keys — TRD §9.8). Dev/CI only — never bundled into production. The light frontend-smoke slice (E13) uses a small Vitest setup. |
| ☐ | Waitlist table **partition key** | Already decided: `email` (E1-T6/E2-T1) — no action needed, listed for completeness. |

---

## ✅ Safe to start now

**`E1-T1 → E1-T2 → E1-T3` (monorepo, CDK skeleton, local bootstrap) require only Tier A.** You can begin building today with just Node, a package manager, Docker, and the CLIs installed — no AWS account, domain, or credentials needed yet.

Line up **Tier B (AWS account + GitHub OIDC role)** and **Tier C (DNS + ACM cert)** in parallel, since `E1-T4`, `E1-T5`, and `E2-T4` become blocked without them. Everything else (Tiers D–F) is only needed at its epic.

---
