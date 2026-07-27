# PETGO Vantage — Migration Verification (Phase 7)

**Date:** 2026-07-28  **Supabase:** `axpqhzjhkunrsasxoria`
**Tested build:** local `full-supabase-migration` branch (all phase commits), driven headlessly in a **fresh Chrome profile = empty localStorage** (equivalent to a fresh incognito window). The Netlify production site deploys manually and predates this work, so it is **not** yet running these changes — deploying is a separate `netlify deploy --prod` step to trigger when ready.

---

## 1. Render proof — fresh browser, data from Supabase alone

A brand-new profile (empty localStorage) was opened, logged in, and `sbReady` awaited. Because localStorage started empty, any data present can only have come from the Supabase bootstrap pull. Every store below reported **`_sbid` on 100% of its rows** (cloud-pulled), and employees carried cloud-only `employee_code` (`EMP-xxx`) + `reports_to`:

| Store | Rows rendered | Cloud-sourced (`_sbid`/cloud id) |
|---|---|---|
| employees | 11 | ✅ `EMP-001…011`, `reports_to` on 10 |
| budgets / invoices / expense_claims / petty_cash | 5 / 5 / 5 / 6 | ✅ all |
| projects / leave_requests / payroll / contracts / onboarding | 5 / 5 / 11 / 7 / 2 | ✅ all |
| companies / opportunities / engagements / pipeline_activity | 29 / 11 / 5 / 6 | ✅ all |
| Dashboard KPIs / Analytics | `PV_FIN` ✓, `PV_MONTHLY` 6, `PV_EXPMIX` 6 | ✅ company_/monthly_financials, expense_breakdown |

**No module failed to render from Supabase.** (Empty stores — reviews, documents, company_reports — correctly rendered empty states.)

## 2. UI create + delete proof (through the app, not SQL)

For each module the real form handler was invoked (fields filled → `saveX()`), the record confirmed to reach Supabase (server id assigned), then removed via the real delete handler:

| Module | Created in cloud | Deleted from cloud |
|---|---|---|
| Team Directory | ✅ | ✅ |
| Budget Tracker | ✅ | ✅ |
| Invoices | ✅ | ✅ |
| Leave Tracker | ✅ | ✅ |
| Projects | ✅ | ✅ |
| Performance Reviews | ✅ | ✅ |

Final leak check: **0 `ZZ`-test rows remain in any table.** A race found during this test (a create-then-delete faster than the 350 ms sync debounce could orphan the freshly-created cloud row) was **fixed** by serializing `syncArray` per table with an in-flight guard (the same pattern `syncEmployees` uses); the re-test showed 0 leaks across all 6 modules including Projects.

## 3. Row counts — before vs after

| | Before | After | Δ |
|---|---|---|---|
| Total rows | 122 | 128 | +6 |
| pipeline_activity | 0 | 6 | **+6** (only change) |
| all other 24 tables | — | — | identical |

The single delta is `pipeline_activity` seeding to cloud on first boot. No data lost; all test records cleaned up; `audit_log` returned to baseline 0.

---

## 4. Final status table

| Module | Status | Rows | Verified how |
|---|---|---|---|
| Dashboard (KPI tiles) | ✅ SYNCED (read) | company_financials 3 | Fresh-profile `PV_FIN` populated; renders LD |
| Analytics (charts + KPIs + snapshots) | ✅ SYNCED (read) | monthly_financials 6, expense_breakdown 6 | Snapshots/KPIs now dynamic; 0 bare `$` (headless scan) |
| Team Directory | ✅ SYNCED | employees 11 | UI add/delete → cloud; `EMP-xxx` on fresh profile |
| Org Chart | ✅ SYNCED (read) | employees 11 | Real recursive `reports_to` tree (11 nodes/4 levels), screenshot |
| Audit Log | ✅ SYNCED | audit_log 0 | 3 actions → 3 rows w/ performed_by+severity, then cleaned |
| Budget Tracker | ✅ SYNCED | 5 | UI add/delete → cloud, net-zero |
| Invoices | ✅ SYNCED | 5 | UI add/delete → cloud, net-zero |
| Expense Claims | ✅ SYNCED | 5 | `_sbid` on all rows (fresh profile) |
| Petty Cash | ✅ SYNCED | 6 | `_sbid` on all rows |
| Projects | ✅ SYNCED | 5 | UI add/delete → cloud, net-zero (post race-fix) |
| Leave Tracker | ✅ SYNCED | 5 | UI add/delete → cloud, net-zero |
| Payroll | ✅ SYNCED | 11 | `_sbid` on all rows |
| Contracts | ✅ SYNCED | 7 | `_sbid` on all rows (PDF blobs stay local) |
| Onboarding | ✅ SYNCED | 2 | `_sbid` on all rows |
| Performance Reviews | ✅ SYNCED | 0 | UI add/delete → cloud (cycle/rating mapped), net-zero |
| Pipeline / BD | ✅ SYNCED | opportunities 11, pipeline_activity 6 | `_sbid` on all rows |
| Pipeline / Operations | ✅ SYNCED | engagements 5 | Renders from `engagements`; `_sbid` on all |
| Reports / Companies | ✅ SYNCED | companies 29 | `_sbid` on all rows |
| Reports / Generated | ✅ SYNCED | company_reports 0 | Wired (`saveRpReports`); on-demand |
| Tenders | ◑ READ-ONLY-SYNCED | tenders 0 | Reads table; external noc.ly scraper writes a Netlify Blob |
| Settings | ○ LOCAL-ONLY (by design) | — | Theme/notif/MS365/credentials/backup keys |
| Announcements | ○ NO-DATA (orphan) | 0 | No UI/module exists |
| Tasks | ○ NO-DATA (orphan) | 0 | No UI/module (project checkpoints are embedded milestones) |
| Project milestones | ○ NO-DATA (flat table) | 0 | Milestones live in `projects.app_data` |

---

## 5. Written summary

**Now fully on Supabase (read + write):** every functional module — the 18 blob-hybrid STORES (Budget, Invoices, Expense Claims, Petty Cash, Projects, Leave, Payroll, Contracts, Onboarding, Performance Reviews, Companies, Generated Reports, Opportunities, Engagements, Documents, Audit Log, Pipeline Activity, plus the tenders read/seed) and Employees (flat-column sync). Dashboard + Analytics read their figures from `company_financials` / `monthly_financials` / `expense_breakdown`. Every create/update/delete now upserts/deletes in Supabase and writes an `audit_log` row (module, action, performed_by → employee UUID, severity).

**Still localStorage-only, by design:** app configuration and secrets — theme, notification prefs, Microsoft-365 mode + client/tenant ids, the demo password store, auto-backup metadata, the FX-rate cache, contract **PDF blobs** (`petgo_con_pdf_*`), and report **logo/description overrides**. These are per-device settings/credentials/binaries that intentionally never leave the browser.

**Empty by design:** `announcements` and `tasks` are orphan tables (no module renders or writes them). `project_milestones` is unused because milestones ride inside `projects.app_data`. `documents`, `company_reports`, `performance_reviews` are correctly wired but simply have no records yet. `tenders` fills from the daily noc.ly scraper (a Netlify Blob), not this client. `audit_log` accrues as the app is used.

**Things I had to guess / flag (not silently change):**
- **Nezar Atiega's email `natiega@petgo.ly`** does not follow the `first.last@petgo.ly` pattern everyone else uses — flagged, left unchanged as instructed.
- The **reporting hierarchy** was implemented exactly as specified; correct any line and it re-applies in one SQL statement (`db/data/…reporting.sql`).
- **Decorative Dashboard cards** (Spend tracking, Budget mix, Spend-vs-plan heatmap, Cost centers, Approvals queue) have no dedicated Supabase table. Rather than invent data, they were left as illustrative chrome but now render all money through the currency utility (LD, no bare `$`). If you want any of these backed by real tables, that's a follow-up.
- The **plan called the Dashboard KPI cards "hardcoded"**, but they were already dynamic from `company_financials`; the genuinely-static content was the Analytics snapshots table + the audit "Recent Activity" SEED, both now fixed.
