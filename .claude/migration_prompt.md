The Supabase migration has not actually started — confirmed directly:
all 24 tables in the PETGO-Vantage Supabase project
(https://axpqhzjhkunrsasxoria.supabase.co) currently have zero rows,
and the live app still has no Supabase client code wired in at all.

Additionally, found and need fixed: the Dashboard and Analytics modules
currently show HARDCODED placeholder numbers baked directly into the
static HTML (not reading from any real data source) — these need to
become genuinely dynamic once the Supabase migration is in place, not
stay as decorative static content.

TASK — do the real migration now, from scratch, properly:

1. First, audit and report back: which modules currently read/write
   real data via localStorage vs. which ones show hardcoded static
   content (Dashboard and Analytics are confirmed hardcoded — check
   every other module too).

2. Load the Supabase client via CDN (this app has no build step):
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
   const supabase = window.supabase.createClient(
     'https://axpqhzjhkunrsasxoria.supabase.co',
     'sb_publishable_R0iw6hsnRD74k1Gjbvkbxw_Ir0lafFB'
   );

3. Migrate module by module, confirming each works end-to-end before
   moving to the next, in this order:
   a. Employees / Team Directory — including wiring the Add/Edit
      Employee modal to write real rows
   b. Dashboard + Analytics — replace hardcoded numbers with real
      aggregation queries against the actual tables (budgets,
      invoices, etc.) once those have real data
   c. Finance: Budget Tracker, Invoices, Expense Claims, Petty Cash
   d. Projects + Contributions (tasks table)
   e. People/HR: Leave, Payroll, Contracts, Onboarding, Performance
   f. Reports: companies, company_reports, tenders
   g. Pipeline: opportunities, engagements

4. For each module migrated, confirm: reading real data works, adding
   a new record via the existing UI actually writes to Supabase, and
   the empty-state ("No employees yet", etc.) correctly shows when a
   table is genuinely empty rather than showing fake numbers.

5. Once Employees is confirmed working, I'll manually re-enter the 11
   real employees via the Add Employee form (or restore from a backup
   file if I still have one) — don't invent placeholder employee data.

Show me each module working before proceeding to the next. This is
the top priority before any mobile/PWA work begins.