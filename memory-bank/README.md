# Beyond Folio — Memory Bank

> Persistent context for AI assistants working on this project.
> Designed to be read in full at the start of every new session.

---

## Why This Exists

AI assistant sessions are ephemeral — each new context window starts blank. This memory bank is the project's durable knowledge layer. Reading these files at the start of a session restores everything an assistant needs to know to be productive immediately, without re-reading the full source-of-truth docs every time.

> **✅ DB pivot complete (2026-06-17 → 2026-06-26): PostgreSQL → DynamoDB.** The project's
> database was redesigned from scratch as a **DynamoDB-native** model, derived **purely from
> `FEATURES.md`**, and is now complete in `DYNAMODB_DATA_MODEL.md`. The relational design
> (`DATA_MODEL.md`, `DATA_MODEL_ANALYSIS.md`) and the polyglot analysis
> (`DB_ALTERNATIVES_ANALYSIS.md`) are **superseded / historical**. `systemPatterns.md` and
> `techContext.md` have been **rewritten for DynamoDB**. See `activeContext.md` for the
> current focus and `progress.md` for status.

---

## Reading Order

Read these files **top to bottom** at the start of every new session:

| #   | File                | What You Learn                                                                       | Stability                              |
| --- | ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | `projectbrief.md`   | What Beyond Folio is, Phase 1 scope, supported brokers                               | Stable — changes only on scope changes |
| 2   | `productContext.md` | Why the product exists, users, key UX flows                                          | Stable                                 |
| 3   | `systemPatterns.md` | ✅ DynamoDB single-table design — the two tables, item types, GSIs, invariants, ADRs | Stable — changes on model change       |
| 4   | `techContext.md`    | ✅ DynamoDB tech stack — engine, mechanisms, external deps, deployment               | Stable — changes on tech-stack change  |
| 5   | `activeContext.md`  | **What we're working on right now**                                                  | **Living — update every session**      |
| 6   | `progress.md`       | Decisions log, open questions, what's done vs pending                                | **Living — update every session**      |

A 5-minute read of all six files should fully orient a new session.

---

## Source-of-Truth Documents

The memory bank **references** but does not duplicate these canonical project docs:

| Document                                  | Purpose                                                                             | When To Open                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **`FEATURES.md`**                         | Plain-language feature requirements — **the sole input** for the DynamoDB model     | The canonical source of truth for what the product does                                            |
| **`PRD.md`**                              | Product Requirements Document — the _what_ and _why_ (Phase 1)                      | When discussing scope, functional requirements, personas, or user journeys                         |
| **`DYNAMODB_DATA_MODEL.md`** ⭐           | **Primary data-model SoT** — DynamoDB-native design (complete, 13 sections)         | When working on the data model, keys, indexes, or persistence                                      |
| `TRD.md`                                  | Technical Requirements Document — the _how_ (**planned**; companion to the PRD)     | When it's written — settles session strategy (OQ-F), market-data provider/range (OQ-E), deployment |
| `unimportant/MASTER_REQUIREMENTS.md`      | Master requirements + locked decisions D-001…D-039 (relational-era; reference-only) | When discussing a specific decision (e.g., "what does D-037 say exactly?")                         |
| `unimportant/DATA_MODEL.md`               | ⚠️ _Superseded_ — PostgreSQL physical schema (DDL, sample data, indexes)            | Historical reference only                                                                          |
| `unimportant/DATA_MODEL_ANALYSIS.md`      | ⚠️ _Superseded_ — PostgreSQL formal analysis (3,125 lines)                          | Historical reference only                                                                          |
| `unimportant/DB_ALTERNATIVES_ANALYSIS.md` | ⚠️ _Superseded_ — polyglot persistence analysis (made moot by the DynamoDB pivot)   | Historical reference only                                                                          |

The memory bank is the **map**; these are the **territory**. If memory-bank content conflicts with these source docs, the source docs win — and the memory bank should be updated.

---

## Update Discipline

| File                   | Update Trigger                                                                   |
| ---------------------- | -------------------------------------------------------------------------------- |
| `projectbrief.md`      | Phase scope changes; new broker added; new top-level feature added               |
| `productContext.md`    | New persona; major UX shift                                                      |
| `systemPatterns.md`    | Schema change; new table; relationship change; new invariant                     |
| `techContext.md`       | Database engine change; new external API; tech-stack change                      |
| **`activeContext.md`** | **Every session — record the current focus, last decision, immediate next step** |
| **`progress.md`**      | **Every meaningful decision or completed task**                                  |

When in doubt: prefer updating `activeContext.md` and `progress.md` over the stable files.

---

## How To Use This in a New Session

1. Read all 6 memory-bank files (in order above).
2. Open whichever source-of-truth doc is relevant to the current task — `FEATURES.md`, `PRD.md`, or `DYNAMODB_DATA_MODEL.md` (the retired relational docs in `unimportant/` are historical reference only).
3. Confirm with the user: "I've read the memory bank. Last active focus was [X]. Continuing from there?"
4. As you work, keep `activeContext.md` and `progress.md` current.

---

_Last bootstrapped: 2026-05-20._
