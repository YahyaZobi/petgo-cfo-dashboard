# Currency Centralization — Design Spec

**Date:** 2026-07-24
**File under change:** `PETGO Vantage v3.html` (single-file app, ~8125 lines)
**Status:** Approved design — ready for implementation planning

## Problem

The header currency switcher (`#pv-currency`, LYD/USD/EUR) only affects the **Dashboard**. Every other module (Payroll, Budget Tracker, Invoices, Expense Claims, Petty Cash, Analytics, Reports, Pipeline, Payslips) shows figures that ignore the selected currency — most display hardcoded "LD".

Root cause: there is **no single currency system**. Three disconnected mechanisms coexist:

1. **Dashboard** (script block lines 3132–3719): local `state.currency`, local `fmtMoney(base,dec,unit,cur)`, `RATES={LYD:1,USD:0.1634,EUR:0.191}` (**LYD-base**), `SYM={LYD:'LD ',USD:'$',EUR:'€'}`. The header click handler (line 3403) re-renders only `.pv-money` spans — which exist only on the Dashboard.
2. **Finance modules** (script block 4096–8065): a *second*, global `fmtMoney(v)` using `currentCurrency`/`CURRENCIES={'USD ($)':rate1,'EUR (€)':0.92,'LYD (LD)':6.12}` (**USD-base**). A late patch (lines 8052–8064) maps the header button to `currentCurrency` and re-renders the active `PV_PAGE_RENDER` page, but many sites bypass it.
3. **Payroll / Payslips**: `fmtLYD(v)` (line 4118) and `_psMoney(v)` (line 4994) that hardcode `'LD '` and never convert.

Secondary defects surfaced during investigation:
- **Mixed storage bases.** Dashboard KPIs/approvals and Payroll are stored in **LYD**; Pipeline opportunities (`estimatedValue`) and the finance modules are stored in **USD**. Any single-argument formatter is necessarily wrong for one of these groups.
- **EUR rates disagree.** Dashboard says 1 LYD = 0.191 EUR; finance says 1 USD = 0.92 EUR. With 1 USD = 6.12 LYD these do not reconcile (6.12 × 0.191 = 1.17 ≠ 0.92). Centralizing removes the second table.

## Goals

- One global currency **state** every module reads from.
- One **rates** table, seeded from the dashboard values, editable in Settings by an Admin, persisted to localStorage.
- One **`formatCurrency()`** that every render site calls; no hardcoded `'LD '`/`'$'`/`'€'` in module code or chart callbacks.
- Switching currency in the header **immediately re-renders every currently-visible number** in whatever module is open.
- Correct conversion regardless of each value's native denomination (no data migration).

## Non-Goals

- No migration/normalization of stored amounts (decision: keep native base, convert on display).
- No live/online FX feed — rates are fixed values, manually editable.
- No new currencies beyond LYD/USD/EUR.
- No redesign of module layouts; logic-only change.

## Decisions (confirmed with user)

1. **Mixed bases → keep native, convert on display.** `formatCurrency(amount, {base})` normalizes from each value's true denomination to LYD, then to the active currency. A $500k opportunity shows `$500,000` in USD and `LD 3,059,975` in LYD. No stored-data migration.
2. **Seed dashboard rates, Admin-gated editor.** Seed `{LYD:1, USD:0.1634, EUR:0.191}` (1 LYD = X), which also fixes the inconsistent EUR. Editable in a Settings card gated behind the existing latent Admin role, persisted to localStorage.

## Architecture

### FX core (new, global) — must load before line 3132

A new `<script>` defining `window.FX`, inserted before the Dashboard script block (3132) so both the Dashboard and finance blocks can call it.

```
FX.rates : { LYD:1, USD:0.1634, EUR:0.191 }   // 1 LYD = X; localStorage 'petgo_fx_rates'
FX.cur   : 'LYD'                              // active code; localStorage 'petgo_fx_cur'
FX.sym   : { LYD:'LD ', USD:'$', EUR:'€' }
FX.defaults = { LYD:1, USD:0.1634, EUR:0.191 } // reset target for Settings editor

FX.load()                 // hydrate rates + cur from localStorage (fallback to defaults)
FX.setRates(obj)          // validate (>0, LYD pinned to 1), persist, notify
FX.set(code)              // set active currency, persist, notify
FX.onChange(fn)           // subscribe; returns unsubscribe
FX.symbol()               // FX.sym[FX.cur]

formatCurrency(amount, opts) where opts = {
    base   = 'LYD',       // native denomination of `amount`: 'LYD' | 'USD' | 'EUR'
    dec    = <auto>,      // fixed decimals; default 2 for full, 0/1 for scaled
    unit   = '',          // pre-scaled suffix e.g. 'M' / 'K' (dashboard/pipeline)
    compact= false        // auto K/M compaction (finance modules)
}
  → lyd   = amount / FX.rates[base]
  → shown = lyd * FX.rates[FX.cur]
  → returns FX.symbol() + format(shown, dec/compact) + unit
```

Three call shapes cover every existing site:
- **Full figures** (Payroll, Invoices detail): default — thousands-separated, 2 dp.
- **Compact** (finance KPIs that showed `$1.2M`/`$486K`): `{compact:true}` — mirrors current `fmtMoney(v)` K/M thresholds.
- **Pre-scaled magnitude** (Dashboard KPIs `148.6`+`'M'`, Pipeline forecast): `{unit:'M', dec:1}` — the magnitude is multiplied by the rate (linear, so scaling is preserved).

### Reactivity — one switch, pub/sub

- The header `#pv-currency` becomes the single control. Its **one** click handler calls `FX.set(btn.dataset.cur)`.
- The three existing competing handlers collapse into `FX.onChange` subscribers:
  1. Dashboard `.pv-money` re-render (keep the animated count-up via the existing `data-base`/`RATES` path, now sourced from `FX`).
  2. Active `PV_PAGE_RENDER[activePage]()` re-render.
  3. Pipeline forecast card (`renderPvForecast`).
- `FX.set` also updates the button `.is-active` state and slider position (retain existing visual).
- On initial load, `FX.load()` sets the active button to the persisted currency.

### Rates editor in Settings (Admin)

- New "Exchange Rates" card added to `renderSettings()` (fn at line 7085).
- Inputs: LYD→USD, LYD→EUR (LYD pinned at 1, shown read-only). Save → `FX.setRates()` → persists + notifies (visible numbers refresh live). A "Reset to defaults" action restores `FX.defaults`.
- Visibility gated behind the existing latent Admin role check (ref: line 3243 note "every user who can log in is Admin today"); wired so it activates cleanly when roles turn on. Non-admins see the rates read-only.

### Audit & replacement (every money site → `formatCurrency`)

| Module / site | Current | Base | Replacement |
|---|---|---|---|
| Payroll table + KPIs (4945–4954) | `fmtLYD(v)` | LYD | `formatCurrency(v,{base:'LYD'})` |
| Payslip figures + PDF (`_psMoney`, 4994/4999/5030/5035/5041) | `fmtLYD` | LYD | `formatCurrency(v,{base:'LYD'})` |
| Payslip labels (4998 words, 5041 "Libyan Dinar (LYD)", 5046 footer) | hardcoded LYD | — | dynamic to active currency (name + "in words"), keep a "disbursed in LYD" note |
| Budget, Invoices, Petty Cash, Expenses, Analytics, Reports | `fmtMoney(v)` (USD-base) | USD | `formatCurrency(v,{base:'USD',compact:true})` (or full where appropriate) |
| Dashboard KPIs / approvals (3360/3386–3390, animMoney) | scoped `fmtMoney(base,…,cur)` | LYD | delegate internals to `formatCurrency` (keep `.pv-money` + count-up) |
| Pipeline opp & engagement values, forecast (`_pfCur`, `PF_RATES`, 7902–7948) | local mirror | USD | source rates/symbol/current from `FX`; forecast bars/ticks/tooltips converted |
| Chart ticks & tooltips (Budget-vs-Actual, Invoice aging, Analytics, Forecast) | hardcoded `$`/`LD` | per chart | `FX.symbol()` + converted values |

Replacement rule of thumb: **LYD-base** sites → Dashboard, Payroll, Payslips. **USD-base** sites → Pipeline, and the finance modules that use `fmtMoney(v)`.

### Legit LYD references to preserve

- The `LYD` header toggle button label.
- A payslip note that pay is **disbursed** in LYD (real-world fact), even though the displayed figure follows the toggle. The prominent figure/label follow the active currency; a small "Salaries are paid in LYD" line remains.

## Edge cases

- **Count-up animation** (`animMoney`, gsap) must keep working — it animates the LYD magnitude then formats; formatting delegates to `formatCurrency`.
- **Chart re-render**: currency change must destroy+rebuild charts on the visible page (existing `PV_PAGE_RENDER` re-render covers most; Pipeline forecast handled explicitly).
- **Persistence race**: `FX.load()` runs before first render so the initial paint uses the saved currency, not the default.
- **Rate validation**: non-numeric / ≤0 inputs rejected; LYD always 1.
- **PDF export of payslip**: uses the same `formatCurrency`, so exported PDF matches on-screen currency.
- **Decimals for LYD vs USD**: LYD figures are large; keep 2 dp for full figures, K/M for compact — same thresholds as today to avoid layout shifts.

## Testing / Verification

1. **Static audit**: after edits, `grep` the file for residual `fmtLYD(`, USD-base `fmtMoney(v)`, and literal `'LD '`/`>$`/`'€'` in render/chart code; every hit must be either routed through `formatCurrency`/`FX.symbol()` or a whitelisted legit-LYD label.
2. **Headless render check** (per project convention): inject a login bypass before the last `</body>`, run Chrome `--headless --screenshot`, switch to **USD**, and capture each module: Dashboard, Payroll, Payslip, Budget, Invoices, Petty Cash, Expenses, Analytics, Reports, Pipeline (Overview/BD/Ops). Confirm no stray `LD ` remains outside whitelisted labels, and that a known value converts correctly (spot-check one figure per module against the rate).
3. **Interaction check**: with a module open, toggle LYD→USD→EUR and confirm visible numbers re-render immediately (no navigation needed) and charts redraw.
4. **Settings check**: edit a rate as Admin, Save, confirm visible figures update and the value persists across reload.

## Risks

- **Wrong base tag on a site** → a figure converts the wrong way. Mitigation: the audit table assigns base per module; spot-check one known value per module in verification.
- **Missed hardcoded site** → stray "LD". Mitigation: grep sweep is exhaustive and part of acceptance.
- **Large single file**: edits are localized (one new script + targeted replacements); no structural moves.

## Acceptance criteria

- Switching header currency re-renders the open module's figures immediately (all modules, not just Dashboard).
- No hardcoded currency symbol/prefix remains in render or chart code (grep-clean except whitelisted labels).
- One rates table, one `formatCurrency`, one global state; rates editable in Settings (Admin) and persisted.
- Verified via headless screenshots across every module in USD with no stray LD and correct conversions.
