# PETGO Vantage — Full Storage Audit (Phase 1)

**Date:** 2026-07-27  **Branch:** `full-supabase-migration`
**Supabase:** `axpqhzjhkunrsasxoria` (permissive anon RLS, intentional)
**File audited:** `PETGO Vantage v3.html` (single-file app, **includes the uncommitted working-tree fixes** — see §4)

---

## 1. How persistence actually works (architecture)

Every module keeps a **localStorage array as its synchronous render source**. Supabase is layered on top by three mechanisms:

1. **Generic STORE engine** (`STORES[]` registry + `pullOrSeed` + `syncArray` + `hookSave`, ~line 8387–8521).
   - On boot, `pullOrSeed(cfg)` runs per store: `SBDB.selectAll(table)` →
     - `null` (fetch error) → **keep local mirror, do nothing** (no wipe).
     - `[]` (confirmed empty) → **seed cloud FROM local demo data**, stamp each row's `_sbid`.
     - rows → **replace local array with cloud rows** (`app_data` blob rehydrates the full record).
   - After all pulls, `hookSave(cfg)` wraps `window[cfg.save]` so every `saveXStore()` call schedules a debounced `syncArray()` that **upserts present rows and deletes removed ones**.
   - Full record rides in the `app_data jsonb` column; flat columns are best-effort for BI.
2. **Employees** sync separately (`syncEmployees` + `empToRow`, flat columns, no `app_data`) — hooked onto `saveEmployeeStore()`.
3. **Dashboard/Analytics** read-only pull: `bootstrapDashboard()` loads `company_financials → PV_FIN`, `monthly_financials → PV_MONTHLY`, `expense_breakdown → PV_EXPMIX`.

**Consequence:** a store is truly **SYNCED** only if its create/edit/delete handlers call the *registered* `saveXStore()` (which is hooked). All raw `fnSave('petgo_…')` calls outside the save-fns were verified to be **first-run seeds / one-time local migrations / engine id-adoption**, not live handlers.

### Verdict legend
- **SYNCED** — reads and writes both hit Supabase.
- **READ-ONLY-SYNCED** — reads Supabase, writes only localStorage (the `saveEmp()` bug class).
- **LOCAL-ONLY** — never touches Supabase.
- **HARDCODED** — renders static content baked into the HTML.
- **NO-DATA** — correctly wired, table simply empty.

---

## 2. Module audit table

| Module | Reads from | Writes to | Supabase table | Verdict |
|---|---|---|---|---|
| **Dashboard** — KPI tiles (cash/rev/EBITDA/NWC) | `PV_FIN` (cloud) → `renderKpis`, hardcoded fallback | — (read-only) | `company_financials` | **SYNCED (read-only)** |
| **Dashboard** — Spend tracking, Budget mix, Spend-vs-plan heatmap, Cost centers, Approvals queue | static HTML | — | none | **HARDCODED** (decorative) |
| **Analytics** — 4 charts | `PV_MONTHLY`,`PV_EXPMIX` (cloud), hardcoded fallback | — (read-only) | `monthly_financials`, `expense_breakdown` | **SYNCED (read-only)** |
| **Analytics** — "Monthly Financial Snapshots" panel | static HTML (to re-confirm in Phase 5) | — | `monthly_financials` | **HARDCODED** (verify) |
| **Documents** | `pullOrSeed` → `docFiles` | `_docSave` → hook | `documents` | **SYNCED** (NO-DATA) |
| **Team Directory** | `bootstrapEmployees` → `employees` | `saveEmp`→`saveEmployeeStore`→`syncEmployees` | `employees` | **SYNCED** *(was READ-ONLY-SYNCED; fixed in working tree)* |
| **Org Chart** | `employees` (cloud) | — (read-only) | `employees` | **SYNCED (read-only)** — but renderer draws CEO→dept buckets, not real `reports_to` (Phase 4e) |
| **Audit Log** (list) | `pullOrSeed` → `auditLog` | `addAudit`→`saveAuditStore`→hook | `audit_log` | **SYNCED** *(fixed in working tree)* (NO-DATA) |
| **Audit Log / Dashboard "Recent Activity" timeline** | `auditLog` **merged with hardcoded `SEED` (s1–s7)** | — | `audit_log` | **HARDCODED** (seed rows, fake `$`) — Phase 5 |
| **Settings** (theme, notif prefs, MS365, backup, account/creds) | `localStorage` direct | `localStorage` direct | none | **LOCAL-ONLY** (by design) |
| **Budget Tracker** | `pullOrSeed`→`budgets` | `saveBudStore`→hook | `budgets` | **SYNCED** |
| **Invoices** | `pullOrSeed`→`invoices` | `saveInvStore`→hook | `invoices` | **SYNCED** |
| **Expense Claims** | `pullOrSeed`→`expenses` | `saveExpStore`→hook | `expense_claims` | **SYNCED** |
| **Petty Cash** | `pullOrSeed`→`pettyCash` | `savePettyStore`→hook | `petty_cash` | **SYNCED** |
| **Projects** | `pullOrSeed`→`projects` | `saveProjStore`→hook | `projects` | **SYNCED** (milestones embedded in `app_data`) |
| **Leave Tracker** | `pullOrSeed`→`leaves` | `saveLeaveStore`→hook | `leave_requests` | **SYNCED** |
| **Payroll** | `pullOrSeed`→`payroll` | `savePayStore`→hook | `payroll` | **SYNCED** (payslip is LYD-native; see memory) |
| **Contracts** | `pullOrSeed`→`contracts` | `saveConStore`→hook | `contracts` | **SYNCED** (PDF blobs `petgo_con_pdf_*` stay local) |
| **Onboarding** | `pullOrSeed`→`onboarding` | `saveObStore`→hook | `onboarding_tasks` | **SYNCED** |
| **Performance Reviews** | `pullOrSeed`→`reviews` | `saveRevStore`→hook | `performance_reviews` | **SYNCED** *(mapper period→cycle/score→rating fixed in working tree)* (NO-DATA) |
| **Pipeline / Business Development** | `pullOrSeed`→`opportunities`,`plActivity` | `savePlOpps`,`savePlActivity`→hook | `opportunities`, `pipeline_activity` | **SYNCED** *(pipeline_activity added in working tree; seeded 0→6 on first cloud boot)* |
| **Pipeline / Operations** | `pullOrSeed`→`engagements`; `renderPlOps` builds from array | `savePlEngs`→hook | `engagements` | **SYNCED** (renders from `engagements`, **not** hardcoded) |
| **Reports / Companies** | `pullOrSeed`→`rpCompanies` | `saveRpCompanies`→hook | `companies` | **SYNCED** (logos/descriptions `petgo_rp_logo_v3`/`_desc_v4` stay local) |
| **Reports / Generated reports** | `pullOrSeed`→`rpReports` | `saveRpReports`→hook | `company_reports` | **SYNCED** (NO-DATA; reports created on demand) |
| **Tenders** | `pullOrSeed`→`rpTenders` (reads `tenders` table) | **no write hook** (`save:null`) | `tenders` | **READ-ONLY-SYNCED** — external scraper writes a **Netlify Blob**, not this table (NO-DATA) |
| **Announcements** | — | — | `announcements` | **NO-DATA (orphan)** — no UI/module exists |
| **Tasks/Contributions** | — | — | `tasks` | **NO-DATA (orphan)** — no UI/module; project sub-tasks are embedded milestones |

---

## 3. The 9 empty tables — why each is empty

| Table | Empty because… | Class |
|---|---|---|
| `announcements` | **No module ever existed.** No nav page, zero code references. Orphan table. | NO-DATA (orphan) |
| `tasks` | **No module.** "Tasks/Contributions" isn't implemented; project checkpoints live as embedded `milestones` inside `projects.app_data`. Orphan table. | NO-DATA (orphan) |
| `project_milestones` | **Data is in cloud, just not here.** Milestones are stored inside each project's `app_data` blob (`projects` table); the flat child table is unused by the app. | NO-DATA (data in `projects.app_data`) |
| `performance_reviews` | **Wired & correct, no rows exist.** `reviews` seeds to `[]` (no demo reviews); flat mapper now maps `period→cycle`, `score→rating`. | NO-DATA |
| `documents` | **Wired & correct, no rows exist.** `docFiles` is empty (no uploads/samples seeded). | NO-DATA |
| `company_reports` | **Wired & correct, no rows exist.** Reports are generated on demand; `rpReports` seeds empty. | NO-DATA |
| `audit_log` | **Was write-broken (local-only); fixed in working tree.** Now `addAudit`→`saveAuditStore`→hook. Empty only because no mutation has run in a cloud-connected session yet (Phase 6 guarantees coverage). | NO-DATA (newly wired) |
| `pipeline_activity` | **Was not registered; fixed in working tree.** Added to `STORES`; my Phase-0 cloud boot seeded it **0→6**. No longer empty. | ✅ now SYNCED + seeded |
| `tenders` | **External-writer gap.** The daily `noc.ly` scraper writes a **Netlify Blob** (consumed by the Tenders UI), not the Supabase `tenders` table; the client only reads/first-run-seeds that table and no local cache existed to seed. | READ-ONLY-SYNCED / NO-DATA |

---

## 4. Working-tree fixes already applied (uncommitted at audit time)

The dirty `PETGO Vantage v3.html` already contains the "3 last gaps" fixes (per project memory, tested):
- `saveEmp()` no longer calls `SBEmp` directly; relies on the hooked `saveEmployeeStore()`→`syncEmployees()` upsert. **This is the `READ-ONLY-SYNCED` (saveEmp) bug — already fixed.**
- `syncEmployees()`/`scheduleEmpSync()` + a hook wrapping `saveEmployeeStore`.
- `bootstrapEmployees()` hardened: a failed/null fetch is never treated as "empty" — keeps local mirror, logs, **retries once**, never wipes.
- `performance_reviews` mapper fixed (`period→cycle`, `score→rating`).
- New `TOROW` mappers + `STORES` entries for `documents`, `audit_log`, `pipeline_activity`; `auditLog` global + `saveAuditStore`, `savePlActivity`.

These land in the **Phase 3** commit (their honest home), not the Phase 0/1 commits.

---

## 5. Revised scope for later phases (what the audit changes)

- **Phase 3** is *much smaller* than the plan assumed — the `saveEmp` bug class is already fixed and every other module already writes through a hooked save-fn. Remaining Phase-3 work: **commit** the working-tree fixes; add **retry** to the generic `bootstrapModules`/`pullOrSeed` (currently keeps-local-on-error but doesn't retry like `bootstrapEmployees` does); audit remaining flat-column mappers (data integrity is already safe via `app_data`).
- **Phase 5** targets are the genuinely static bits: Dashboard **decorative** cards (Spend tracking / Budget mix / Spend-vs-plan heatmap / Cost centers / Approvals), the **`renderHistoryTimeline` `SEED`** rows (fake `$`), and the Analytics **"Monthly Financial Snapshots"** panel (confirm). Note: the plan calls the Dashboard *KPI* cards hardcoded, but those are actually the *dynamic* ones — do not "fix" working KPIs.
- **Phase 6** — `audit_log` is now wired; the work is ensuring *every* mutation across every module calls `addAudit(...)`.
- **Orphan tables** (`announcements`, `tasks`) have no module; leave empty by design unless a feature is requested.
