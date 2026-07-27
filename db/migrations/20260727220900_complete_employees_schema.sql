-- Migration: complete_employees_schema  (version 20260727220900)
-- Applied to Supabase project axpqhzjhkunrsasxoria on 2026-07-27 via MCP apply_migration.
-- ADDITIVE ONLY — no existing column renamed or dropped.
--
-- Adds reporting-line + HR fields to employees, plus a future-proof app_data blob.
--
-- app_data scoping decision (Phase 2 audit): every STORES-backed table already had
-- app_data (from migration 20260726230635 add_app_data_blob_columns +
-- 20260727150525 migrate_documents_audit_pipeline_activity). The only table whose
-- module carries extra fields with nowhere to land was `employees` (flat-column
-- sync, no blob) — so app_data is added HERE only. The remaining columnless tables
-- are read-only/flat (company_financials, monthly_financials, expense_breakdown) or
-- orphan/child tables with no writing module (announcements, tasks,
-- project_milestones), none of which need a blob.

alter table public.employees
  add column if not exists reports_to uuid references public.employees(id) on delete set null,
  add column if not exists hire_date date,
  add column if not exists status text default 'active',
  add column if not exists employment_type text,
  add column if not exists annual_leave_entitlement numeric default 30,
  add column if not exists leave_balance numeric,
  add column if not exists app_data jsonb;

create index if not exists idx_employees_reports_to on public.employees(reports_to);
