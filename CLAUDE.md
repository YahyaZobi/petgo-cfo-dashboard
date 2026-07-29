# PETGO Vantage

Internal operations platform for PETGO (Libyan oil & gas services, 11 staff).

## Architecture
- Single-file app: index.html contains all HTML, CSS, vanilla JS
- No build step, no npm, no framework. CDN imports only (GSAP).
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

## Constraints
- Do NOT introduce a build step or framework without asking
- Do NOT split index.html without an explicit plan approved first
- Supabase RLS policies must be verified on any schema change

## Known constraints / open issues
- Client-side only: any API key in index.html is publicly visible.
  Vantage Copilot must proxy through a serverless function, never
  embed the Groq key directly.
- No test runner exists. Verify changes by manual checklist.

## Source of truth
- Employee roster: Supabase `employees` table (11 rows). Not localStorage.
- localStorage migration is COMPLETE. Do not add localStorage persistence.