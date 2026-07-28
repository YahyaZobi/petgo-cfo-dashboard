# PETGO Vantage — Supabase Migration Report

**Completed:** 2026-07-28  **Branch:** `full-supabase-migration` (8 phase commits) → merged to `main`
**Supabase project:** `axpqhzjhkunrsasxoria` · permissive anon RLS (intentional for now)
**App:** single-file `PETGO Vantage v3.html` — localStorage is the synchronous render source; Supabase is the source of truth, mirrored on every save.

---

## 1. Final status by module

| Module | Status | Rows (cloud) | Verified how |
|---|---|---|---|
| Dashboard — KPI tiles | **SYNCED (read)** | company_financials 3 | Fresh profile populates `PV_FIN`; renders LD |
| Dashboard — decorative cards | **Chrome** (no table) | — | Render via currency utility; 0 bare `$` |
| Analytics — charts + KPIs + snapshots | **SYNCED (read)** | monthly_financials 6, expense_breakdown 6 | Snapshots + KPIs now dynamic; headless `$`-scan clean |
| Team Directory | **SYNCED** | employees 11 | UI add/delete → cloud; `EMP-xxx` on fresh profile |
| Org Chart | **SYNCED (read)** | employees 11 | Real recursive `reports_to` tree — 11 nodes / 4 levels (screenshot) |
| Audit Log | **SYNCED** | audit_log 0 | 3 UI actions → 3 rows (performed_by + severity), then cleaned |
| Budget Tracker | **SYNCED** | 5 | UI add/delete → cloud, net-zero |
| Invoices | **SYNCED** | 5 | UI add/delete → cloud, net-zero |
| Expense Claims | **SYNCED** | 5 | `_sbid` on 100% of rows (fresh profile) |
| Petty Cash | **SYNCED** | 6 | `_sbid` on 100% of rows |
| Projects | **SYNCED** | 5 | UI add/delete → cloud, net-zero (after race fix) |
| Leave Tracker | **SYNCED** | 5 | UI add/delete → cloud, net-zero |
| Payroll | **SYNCED** | 11 | `_sbid` on 100% of rows |
| Contracts | **SYNCED** | 7 | `_sbid` on 100% of rows (PDF blobs stay local) |
| Onboarding | **SYNCED** | 2 | `_sbid` on 100% of rows |
| Performance Reviews | **SYNCED** | 0 | UI add/delete → cloud (cycle/rating mapped), net-zero |
| Pipeline / Business Development | **SYNCED** | opportunities 11, pipeline_activity 6 | `_sbid` on 100% of rows |
| Pipeline / Operations | **SYNCED** | engagements 5 | Renders from `engagements`; `_sbid` on all |
| Reports / Companies | **SYNCED** | companies 29 | `_sbid` on 100% of rows |
| Reports / Generated | **SYNCED** | company_reports 0 | Wired (`saveRpReports`); created on demand |
| Tenders | **READ-ONLY-SYNCED** | tenders 0 | Reads table; noc.ly scraper writes a Netlify Blob |
| Settings | **LOCAL-ONLY** (design) | — | Theme / notif / MS-365 / credentials / backup |
| Announcements | **NO-DATA (orphan)** | 0 | No UI/module exists |
| Tasks | **NO-DATA (orphan)** | 0 | No UI/module (checkpoints = embedded milestones) |
| Project milestones | **NO-DATA (flat table)** | 0 | Milestones live in `projects.app_data` |

**Every functional module renders and persists from Supabase.** Empty stores render proper empty states, not fake numbers.

---

## 2. Row counts — before vs after

| | Before | After |
|---|---|---|
| **Total** | 122 | 128 |
| pipeline_activity | 0 | **6** |
| _all other 24 tables_ | — | _identical_ |

**Only net change: `pipeline_activity` 0 → 6** — the pipeline activity feed (a new STORES entry from the write-path fixes) seeded to cloud on the first cloud-connected boot. No data lost. All Phase-7 UI test records deleted (0 leaks). `audit_log` returned to its baseline 0 (test-session entries removed; it accrues in real use). Full lists in `backups/row-counts-before.txt` and `backups/row-counts-after.txt`.

---

## 3. What is fully on Supabase vs localStorage-only

**Fully on Supabase (read + write):** the 18 blob-hybrid stores (Budget, Invoices, Expense Claims, Petty Cash, Projects, Leave, Payroll, Contracts, Onboarding, Performance Reviews, Companies, Generated Reports, Opportunities, Engagements, Documents, Audit Log, Pipeline Activity, + tenders read/seed) and Employees (flat-column sync). Dashboard + Analytics read their figures from `company_financials` / `monthly_financials` / `expense_breakdown`. Every create/update/delete upserts/deletes in Supabase **and** writes an `audit_log` row.

**Still localStorage-only — by design:** application config and secrets — UI theme, notification prefs, Microsoft-365 mode + client/tenant ids, the demo-password store, auto-backup metadata, the FX-rate cache, contract **PDF blobs** (`petgo_con_pdf_*`), and report **logo/description overrides**. These are per-device settings, credentials, and binaries that intentionally never leave the browser.

---

## 4. Empty by design

- **`announcements`, `tasks`** — orphan tables; no module renders or writes them.
- **`project_milestones`** — unused flat table; milestones ride inside `projects.app_data`.
- **`documents`, `company_reports`, `performance_reviews`** — correctly wired, simply no records yet.
- **`tenders`** — filled by the daily noc.ly scraper (a Netlify Blob), not this client.
- **`audit_log`** — starts empty; accrues as the app is used.

---

## 5. Things I had to guess at / flag

- **Nezar Atiega's email `natiega@petgo.ly`** does not follow the `first.last@petgo.ly` pattern everyone else uses — **flagged, left unchanged** as instructed.
- The **reporting hierarchy** was implemented exactly as specified (root = Nezar). Correct any line and it re-applies via `db/data/20260727_employee_codes_roles_reporting.sql`.
- **Decorative Dashboard cards** (Spend tracking, Budget mix, Spend-vs-plan heatmap, Cost centers, Approvals queue) have no dedicated Supabase table. Rather than invent data, they were left as illustrative chrome but now render all money through the currency utility (LD, no bare `$`). Backing any of these with real tables is a follow-up.
- The plan called the **Dashboard KPI cards "hardcoded"**, but they were already dynamic from `company_financials`; the genuinely-static content was the Analytics snapshots table and the audit "Recent Activity" SEED — both now fixed.

---

## 6. The in-flight guard fix (create-then-delete race)

**The race:** each store's writes are mirrored to Supabase by `syncArray`, triggered through a 350 ms debounced `scheduleSync`. If a record was **created and then deleted faster than that debounce**, two problems collided: the delete's `syncArray` computed its "known cloud ids" diff **before the create's `INSERT` response had returned** with the new row's id. So the delete didn't know the row existed in the cloud yet, skipped it, and the create's insert then landed — leaving an **orphaned cloud row**. In the Phase-7 automated test (which creates and deletes within ~2.4 s) this leaked one `Projects` row.

**The fix:** serialize `syncArray` per table with an in-flight guard + dirty flag — the exact pattern `syncEmployees` already used:

```js
function _runSync(cfg){
  if(_syncing[cfg.table]){ _syncDirty[cfg.table]=true; return; }   // a sync is running → mark dirty
  _syncing[cfg.table]=true;
  Promise.resolve(syncArray(cfg)).catch(...).then(function(){
    _syncing[cfg.table]=false;
    if(_syncDirty[cfg.table]){ _syncDirty[cfg.table]=false; _runSync(cfg); }  // re-run once, after insert ids exist
  });
}
```

Now a delete scheduled during an in-flight create waits for the create to finish (so the new `_sbid` is tracked) and then re-runs, correctly removing the row. **Re-test after the fix: 0 leaks across all 6 modules, including Projects.** (Normal human usage never hit this — it requires deleting a brand-new record within a third of a second — but it was a genuine correctness gap and is now closed.)

---

*Detailed Phase-7 evidence (render proof, per-module CRUD table): `MIGRATION_VERIFICATION.md`. Storage audit: `MIGRATION_AUDIT.md`. Applied SQL: `db/migrations/`, `db/data/`.*
