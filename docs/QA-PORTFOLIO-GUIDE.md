# TaskFlow — Quality Engineering Portfolio Guide

## 1. Test Strategy

TaskFlow applies a **three-layer verification strategy** so frontend success never masks API contract regressions or relational database anomalies:

1. **UI & Exploratory / Browser Layer (React + Playwright)**
   - Verifies user workflows (registration, login, protected routes, task CRUD, search/filter/sort, profile updates, responsive desktop/mobile layout, and console cleanliness).
   - Automated specs live in `tests/e2e/taskflow.spec.mjs` with reusable Page Objects in `tests/e2e/pages/TaskFlowPage.mjs`.
2. **API & Business Logic Layer (Express + Node `node:test` + Postman/Newman)**
   - Pure validation and analytics logic is unit-tested via `npm run test:unit`.
   - End-to-end HTTP contracts, authentication guards, negative inputs, and cross-user isolation (HTTP `403`) are automated via **TaskFlow API Guard** (`qa/postman/taskflow-api-guard.postman_collection.json`, 34 requests / 178 assertions) plus data-driven negative CSV testing (`qa/postman/negative-data.csv`).
3. **Database Integrity Layer (PostgreSQL + Drizzle ORM)**
   - Non-destructive live validation suite (`src/lib/postgresValidator.ts`) checks primary keys, foreign keys, unique email constraints, orphaned tasks, NOT NULL/domain integrity, and rolled-back `SQLSTATE 23503` (FK) and `23505` (unique) enforcement inside PostgreSQL transactions.

---

## 2. Test Plan Summary

- **In Scope**:
  - Module 1: Authentication (registration, login, logout, session persistence, token revocation, protected routes).
  - Module 2: Task Management (create, edit, complete/reopen, delete, deadlines, priorities, descriptions).
  - Module 3: Search, Filtering & Sorting (title/description search, status/priority filter, sort by created date or deadline).
  - Module 4: User Profile (view/update name & email, duplicate email protection, password change).
  - Module 5: Dashboard Analytics (total, completed, pending, overdue counts, completion percentage).
  - Quality Engineering Modules: SRS & RTM, Test Design (7 techniques), Test Cycles (`Internal QA` vs `External User / Client`), Immutable Execution History, Defect Lifecycle + Audit Trail + GitLab REST API integration, Live Newman & PostgreSQL Runners, and QA Analytics Reports.
- **Out of Scope / Known Limitations**:
  - Google OAuth popup flow requires live browser interaction with Google identity services and is not executed in headless CI.
  - External GitLab REST API issue creation requires configuring `GITLAB_TOKEN` and `GITLAB_PROJECT_ID`; when absent, defects export structured GitLab Markdown without fabricating issue IDs.
  - `.gitlab-ci.yml` is configured and version-controlled for GitLab Runner execution; it does not run automatically inside local sandboxes until pushed to a GitLab repository.

---

## 3. Requirements Engineering & Traceability (SRS & RTM)

TaskFlow seeds **23 realistic SRS requirements** mapped strictly to actual implemented behavior:
- `AUTH-01` – `AUTH-07`: Registration, validation, duplicate prevention, login/persistence, invalid login rejection, logout revocation, route guards.
- `TASK-01` – `TASK-08`: Creation, title boundary validation, edit, completion toggle, deletion, deadlines, priorities, cross-user isolation.
- `SRCH-01` – `SRCH-03`: Search, status/priority filter, creation/deadline sorting.
- `PROF-01` – `PROF-02`: Name/email profile updates, password change validation.
- `DASH-01`: Real-time dashboard KPIs and completion percentage.
- `NFR-01` – `NFR-02`: PostgreSQL relational integrity and responsive desktop/mobile layout.

The **Requirement Traceability Matrix (RTM)** automatically flags:
- Uncovered requirements (0 linked test cases).
- Unlinked test cases (referencing unknown SRS IDs).
- Requirements with failing test cases.
- Overall requirement coverage percentage.

---

## 4. Test Design Techniques Covered

The **30 structured test cases** cover all seven standard black-box techniques:
1. **Positive Testing** — Happy-path registration, login, task CRUD, completion, profile updates.
2. **Negative Testing** — Malformed emails, invalid passwords, unauthorized 401 access, invalid status enums.
3. **Boundary Value Analysis** — 7-char vs 8-char password boundary, empty/201-char task title boundaries.
4. **Equivalence Partitioning** — Valid/invalid priority and status classes.
5. **Decision Table Testing** — Combined search + status + priority filter intersections.
6. **State Transition Testing** — `pending <-> completed` task transitions and `Open -> In Progress -> Fixed -> Retesting -> Closed / Reopened` defect workflows.
7. **Error Guessing** — Cross-user task ID tampering (`403 Forbidden`), duplicate email casing collisions (`409 Conflict`), token replay after logout (`401 Unauthorized`).

All newly created or duplicated test cases start in **`Not Run`** status until executed.

---

## 5. Automation & CI Execution Commands

```bash
# TypeScript static typecheck
npm run lint

# Unit tests (validation + analytics + RTM + QA portfolio metrics)
npm run test:unit

# API Regression Suite (TaskFlow API Guard: 34 requests, 178 assertions)
npm run test:api

# Data-Driven Negative API Suite (CSV-backed negative registration payloads)
npm run test:api:ddt

# Playwright Browser E2E Suite (requires Playwright installed locally or in CI)
npx playwright test
```

---

## 6. Evidence & Reporting Principles

- **Zero Fabricated Metrics**: Dashboard KPIs, pass rates, defect closure rates, Newman metrics, and PostgreSQL integrity results are computed strictly from real PostgreSQL records and live executions.
- **Explicit Empty States**: Unexecuted test suites and unlogged defect areas display explicit `"No execution data yet"` / `"Not Run"` indicators rather than simulated scores.
- **Clear Internal vs External Testing**: Test cycles and execution records explicitly distinguish `Internal QA` runs from `External User / Client` UAT sessions.
