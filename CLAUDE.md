# PETGO Vantage

Internal operations platform for PETGO (Libyan oil & gas services, 11 staff).

## Architecture
- index.html contains all app HTML, CSS, vanilla JS. No frontend framework.
- npm exists for tooling and Netlify Functions only — NOT a frontend build
  step. index.html is served as-is.
- Netlify Functions live in netlify/functions/. Use these for anything
  requiring a secret — the browser must never hold an API key.
- Data layer: Supabase (project axpqhzjhkunrsasxoria, eu-west-1)
- Deployed: Netlify, auto-deploy from main

## Modules (17+)
Dashboard, Analytics, Documents, Team Directory, Audit Log, Settings,
Budget Tracker, Invoices, Expense Claims, Petty Cash, Projects, Leave Tracker,
Payroll, Contracts, Onboarding, Org Chart, Performance Reviews, Pipeline,
Reports.

## Design system
Two-tier glassmorphism sidebar, premium card system, Apple-style frosted
panels, GSAP animations. Tagline: "One view. Every decision."
See DESIGN_SYSTEM.md.

## Roles
CEO Nezar Atiega = Executive Approver. Karen Mombay (CFO) = Finance Approver
under threshold. Both Admin in Vantage.

## Source of truth
- Employee roster: Supabase `employees` table (11 rows). Not localStorage.
- localStorage migration is COMPLETE. Do not add localStorage persistence.

## Constraints
- Do NOT introduce a frontend build step or framework without asking.
- Do NOT split index.html without an explicit plan approved first.
- Supabase RLS policies must be verified on any schema change.
- Secrets NEVER go in index.html — it ships to every browser. Anything
  requiring a key goes through netlify/functions/ with the key in a Netlify
  env var.
- Copilot (and any future feature) must query Supabase using the signed-in
  user's JWT, never the service role key. RLS must apply identically to
  Copilot and the UI.
- No test runner exists. Verify changes by manual checklist.

## Vantage Copilot scope
In scope: Tenders/Reports, Pipeline, Projects, Team Directory, Leave, Org Chart.
Out of scope: all financial modules (Budget Tracker, Invoices, Expense Claims,
Petty Cash), Payroll, Performance Reviews, Audit Log.