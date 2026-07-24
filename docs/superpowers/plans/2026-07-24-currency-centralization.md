# Currency Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the header currency switcher (LYD/USD/EUR) convert every money figure in every module — not just the Dashboard — through one global currency state, one rates table, and one `formatCurrency()`.

**Architecture:** Add a global `window.FX` core (state + pub/sub + `formatCurrency`/`FX.conv`) that loads before all render code. Route the existing formatter functions (`fmtMoney` ×2, `fmtLYD`, `_psMoney`) through it as thin wrappers so ~60 call sites keep working but become currency-aware, then fix the handful of hardcoded chart/label literals directly. The header switch calls `FX.set()`; subscribers re-render the visible module. Storage bases stay native (LYD for Dashboard/Payroll, USD for Pipeline/finance) and convert on display.

**Tech Stack:** Single-file vanilla-JS app (`PETGO Vantage v3.html`, ~8125 lines), GSAP, Chart.js, localStorage. No build step, no existing test runner. Verification = Node assertion harness for pure logic + `grep` source audits + headless Chrome screenshots/DOM dumps.

## Global Constraints

- All edits are to one file: `PETGO Vantage v3.html` (repo root; dir path has a trailing space — always quote it).
- FX core `<script>` MUST be inserted before line 3132 (the Dashboard script block) so both Dashboard (3132–3719) and finance (4096–8065) blocks can call it.
- Canonical base is **LYD**; rates are `1 LYD = X`: seed `{LYD:1, USD:0.1634, EUR:0.191}`. Never introduce a second rates table.
- Storage bases are fixed and NOT migrated: Dashboard KPIs/approvals + Payroll/Payslip = **LYD-base**; Pipeline opportunities + finance modules (Budget/Invoices/Petty/Expenses/Analytics/Reports) = **USD-base**.
- localStorage keys: `petgo_fx_rates` (`{USD,EUR}`), `petgo_fx_cur` (`'LYD'|'USD'|'EUR'`).
- Symbols: `{LYD:'LD ', USD:'$', EUR:'€'}`. No hardcoded `'$'`/`'LD '`/`'€'` may remain in render or chart code except whitelisted legit-LYD labels (the `LYD` toggle button; the payslip "disbursed in LYD" note).
- Preserve existing visual behavior: GSAP count-up on Dashboard KPIs, the currency-toggle slider, chart rebuild-on-render.
- Commit after each task. Work is on branch `currency-centralization`.
- Verification scratch dir: `export SCRATCH="/private/tmp/claude-501/-Users-yahyazobi-PETGO-Finance-/f40dd6ba-b2e9-4b5f-be05-318986f3b388/scratchpad"` (used for temp copies, screenshots, helpers — never committed).

---

### Task 1: FX core + `formatCurrency` (pure logic) with Node test harness

**Files:**
- Modify: `PETGO Vantage v3.html` — insert a new `<script>` immediately before line 3132 (`<script>` that opens the Dashboard block).
- Test: `$SCRATCH/fx-core.test.mjs` (Node, no deps; extracts the FX core from the HTML and asserts).

**Interfaces:**
- Produces (global): `window.FX` = `{ rates, cur, sym, defaults, symbol(), conv(amount,base), setRates(obj), set(code), onChange(fn)→unsub }` and `window.formatCurrency(amount, {base='LYD', dec=2, unit='', compact=false})`.
- `FX.conv(amount, base)` returns a **Number** in the active currency; `formatCurrency(...)` returns a **String** with symbol.

- [ ] **Step 1: Write the failing test** — create `$SCRATCH/fx-core.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Extract the FX core between markers from the real HTML, then eval in a stubbed env.
const html = readFileSync(process.env.APP || 'PETGO Vantage v3.html', 'utf8');
const m = html.match(/\/\* FX-CORE-START[\s\S]*?FX-CORE-END \*\//);
assert.ok(m, 'FX-CORE markers not found in HTML');

const store = {};
const localStorage = { getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
const window = {};
new Function('window','localStorage', m[0] + '\n;window.__FX=FX;window.__fc=formatCurrency;')(window, localStorage);
const FX = window.FX, fc = window.formatCurrency;

// defaults + LYD base identity
assert.equal(FX.cur, 'LYD');
assert.equal(fc(1000, {base:'LYD'}), 'LD 1,000.00');
// USD-base value shown in each currency (0.1634 => 1 USD = 6.1200 LYD)
FX.set('USD');
assert.equal(fc(500000, {base:'USD'}), '$500,000.00');
FX.set('LYD');
assert.equal(fc(500000, {base:'USD'}), 'LD 3,059,975.52'); // 500000/0.1634
// LYD-base payroll value in USD
FX.set('USD');
assert.equal(fc(1240000, {base:'LYD'}), '$202,616.00'); // 1240000*0.1634
// compact + scaled-unit shapes
assert.equal(fc(486000, {base:'USD', compact:true}), '$486.0K');
FX.set('LYD');
assert.equal(fc(148.6, {base:'LYD', dec:1, unit:'M'}), 'LD 148.6M');
// conv returns a number; symbol() reflects state
assert.equal(FX.symbol(), 'LD ');
FX.set('EUR');
assert.equal(Math.round(FX.conv(1000,'LYD')*1000)/1000, 191); // 1000*0.191
// setRates validates + persists
assert.equal(FX.setRates({USD:0.2, EUR:0.18}), true);
assert.equal(FX.setRates({USD:0, EUR:0.18}), false);
assert.equal(JSON.parse(store['petgo_fx_rates']).USD, 0.2);
console.log('OK fx-core');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/yahyazobi/PETGO Finance " && APP="PETGO Vantage v3.html" node "$SCRATCH/fx-core.test.mjs"`
Expected: FAIL — `AssertionError: FX-CORE markers not found in HTML`.

- [ ] **Step 3: Insert the FX core** — add this new `<script>` block immediately BEFORE the `<script>` on line 3132:

```html
<script>
/* FX-CORE-START — single source of truth for currency. Loads before all render code.
   Bases are "1 LYD = X". Stored amounts keep their native base and convert on display. */
(function(){
  var DEFAULTS = { LYD:1, USD:0.1634, EUR:0.191 };
  var SYM      = { LYD:'LD ', USD:'$', EUR:'€' };
  var subs = [];
  function num(v){ return (typeof v==='number'&&isFinite(v))?v:parseFloat(v)||0; }
  function loadRates(){
    try{ var r=JSON.parse(localStorage.getItem('petgo_fx_rates')||'null');
      if(r && num(r.USD)>0 && num(r.EUR)>0) return {LYD:1, USD:num(r.USD), EUR:num(r.EUR)}; }catch(e){}
    return {LYD:1, USD:DEFAULTS.USD, EUR:DEFAULTS.EUR};
  }
  function loadCur(){
    var c=null; try{ c=localStorage.getItem('petgo_fx_cur'); }catch(e){}
    return (c==='USD'||c==='EUR'||c==='LYD') ? c : 'LYD';
  }
  function notify(){ subs.slice().forEach(function(fn){ try{ fn(FX.cur, FX.rates); }catch(e){} }); }
  var FX = {
    rates: loadRates(),
    cur:   loadCur(),
    sym:   SYM,
    defaults: DEFAULTS,
    symbol: function(){ return SYM[FX.cur]; },
    conv: function(amount, base){ return num(amount) / (FX.rates[base||'LYD']||1) * (FX.rates[FX.cur]||1); },
    setRates: function(obj){
      if(!(obj && num(obj.USD)>0 && num(obj.EUR)>0)) return false;
      FX.rates = { LYD:1, USD:num(obj.USD), EUR:num(obj.EUR) };
      try{ localStorage.setItem('petgo_fx_rates', JSON.stringify({USD:FX.rates.USD, EUR:FX.rates.EUR})); }catch(e){}
      notify(); return true;
    },
    set: function(code){
      if(code!==FX.cur && (code==='USD'||code==='EUR'||code==='LYD')){
        FX.cur = code; try{ localStorage.setItem('petgo_fx_cur', code); }catch(e){}
        notify();
      }
    },
    onChange: function(fn){ subs.push(fn); return function(){ var i=subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; }
  };
  function fmtNum(n, dec, compact){
    if(compact){
      var a=Math.abs(n);
      if(a>=1e6) return (n/1e6).toFixed(2)+'M';
      if(a>=1e3) return (n/1e3).toFixed(1)+'K';
      return n.toFixed(2);
    }
    return n.toLocaleString('en-US',{minimumFractionDigits:dec, maximumFractionDigits:dec});
  }
  function formatCurrency(amount, opts){
    opts = opts || {};
    var dec = (opts.dec==null) ? 2 : opts.dec;
    var n = FX.conv(amount, opts.base||'LYD');
    return SYM[FX.cur] + fmtNum(n, dec, !!opts.compact) + (opts.unit||'');
  }
  window.FX = FX;
  window.formatCurrency = formatCurrency;
})();
/* FX-CORE-END */
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/yahyazobi/PETGO Finance " && APP="PETGO Vantage v3.html" node "$SCRATCH/fx-core.test.mjs"`
Expected: `OK fx-core`

- [ ] **Step 5: Commit**

```bash
cd "/Users/yahyazobi/PETGO Finance "
git add "PETGO Vantage v3.html"
git commit -m "feat(currency): add global FX core + formatCurrency"
```

---

### Task 2: Route formatters through FX + single switch with pub/sub

Make every existing formatter delegate to FX, make the header the single control, and retire the two duplicate handlers + old USD-base globals.

**Files:**
- Modify: `PETGO Vantage v3.html` at these anchors:
  - Dashboard `fmtMoney`/`RATES`/`SYM` (3358–3362), currency handler (3400–3419), `animMoney`/count-up (3363–3369, 3626).
  - Finance `currentCurrency`/`CURRENCIES`/`applyCurrency`/`fmtMoney(v)` (4099–4114), `fmtLYD` (4118), `_psMoney` (4994).
  - Pipeline `PF_RATES`/`PF_SYM`/`_pfCur` (7902–7903) and forecast handler (7977–7982).
  - Finance header sync IIFE (8052–8064).

**Interfaces:**
- Consumes: `window.FX`, `window.formatCurrency` from Task 1.
- Produces: header `#pv-currency` click → `FX.set(code)`; three `FX.onChange` subscribers (dashboard spans, active page, forecast).

- [ ] **Step 1: Point the Dashboard formatter + rates at FX.** Replace lines 3358–3362:

```js
  var RATES = FX.rates;   /* live reference to the single source */
  var SYM   = FX.sym;
  function fmtMoney(base, dec, unit, cur){
    return formatCurrency(base, {base:'LYD', dec:dec, unit:unit});
  }
```

(`cur` arg is now ignored — currency comes from `FX.cur`. Dashboard values are LYD-base.)

- [ ] **Step 2: Make the Dashboard currency handler drive FX only.** Replace the handler body at 3403–3419 with:

```js
  curEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-cur]');
    if (!btn || btn.dataset.cur === FX.cur) return;
    moveSlider(curSlider, btn);
    curEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    FX.set(btn.dataset.cur);          /* single source; subscribers re-render */
  });
  /* re-render Dashboard money spans whenever currency changes (animated) */
  FX.onChange(function(){
    document.querySelectorAll('.pv-money').forEach(function(el){
      var base=parseFloat(el.getAttribute('data-base')), dec=+el.getAttribute('data-dec'), unit=el.getAttribute('data-unit')||'';
      if(isNaN(base)) return;
      el.textContent = formatCurrency(base, {base:'LYD', dec:dec, unit:unit});
    });
  });
```

Also delete `state.currency` reads: at 3371 leave the property but it is now unused; at 3649 replace `cur = state.currency` with `cur = FX.cur` if referenced. Count-up lines 3367/3369/3626 already call `fmtMoney(...)` which now delegates — no change needed.

- [ ] **Step 3: Initialize the active button from FX on load.** Immediately after the handler, add:

```js
  (function(){ var b=curEl.querySelector('button[data-cur="'+FX.cur+'"]'); if(b){ curEl.querySelectorAll('button').forEach(function(x){x.classList.toggle('is-active',x===b);}); moveSlider(curSlider,b);} })();
```

- [ ] **Step 4: Replace finance globals + formatters.** Replace lines 4099–4118 (the `currentCurrency`/`CURRENCIES`/`applyCurrency`/`fmtMoney`/`fmtLYD` block) with:

```js
/* Currency is centralized in the FX core (see FX-CORE). These remain as thin
   wrappers so existing call sites keep working but now follow the header toggle.
   Finance modules store USD-base amounts; payroll/payslips store LYD. */
function fmtMoney(v){ return formatCurrency(v, {base:'USD', compact:true}); }
function fmtLYD(v){ return formatCurrency(v, {base:'LYD'}); }
```

- [ ] **Step 5: Repoint `_psMoney`.** Replace line 4994:

```js
function _psMoney(v){ return formatCurrency(v, {base:'LYD'}); }
```

- [ ] **Step 6: Repoint Pipeline forecast to FX.** Replace 7902–7903:

```js
function _pfCur(){ return FX.cur; }
```

In `renderPvForecast` (7929–7948), replace the manual `PF_RATES`/`PF_SYM` math with FX. Specifically:
- Line 7929: `elTotal.setAttribute('data-base',(FX.conv(totalUSD,'USD')/1e6).toFixed(2));`
- Line 7930: `elTotal.textContent = formatCurrency(totalUSD/1e6, {base:'USD', dec:2, unit:'M'});`
- Line 7939: `var rate = FX.rates[FX.cur]/FX.rates.USD, sym = FX.symbol();`
- Bars (7942) and ticks/tooltips (7947–7948) keep using `rate`/`sym` (now FX-sourced) — no further change.

- [ ] **Step 7: Replace the finance header-sync IIFE with a subscriber.** Replace lines 8052–8064 with:

```js
/* finance modules + active page re-render on currency change */
FX.onChange(function(){
  var active=document.querySelector('.pv-page.is-active');
  if(active && typeof PV_PAGE_RENDER!=='undefined' && PV_PAGE_RENDER[active.dataset.page]) PV_PAGE_RENDER[active.dataset.page]();
});
```

- [ ] **Step 8: Replace the Pipeline forecast click listener with a subscriber.** Replace 7977–7982 with:

```js
  FX.onChange(function(){
    var a=document.querySelector('.pv-page.is-active');
    if(a && a.dataset.page==='Dashboard') renderPvForecast();
  });
```

- [ ] **Step 9: Static audit — old globals gone, one rates table.**

Run: `cd "/Users/yahyazobi/PETGO Finance " && grep -nE "currentCurrency|applyCurrency|CURRENCIES|PF_RATES|PF_SYM|CUR_MAP" "PETGO Vantage v3.html" || echo "CLEAN"`
Expected: `CLEAN` (no matches).

Run: `grep -c "FX-CORE-START" "PETGO Vantage v3.html"` → Expected: `1`.

- [ ] **Step 10: Create the headless verification helper** `$SCRATCH/fxshot.sh`:

```bash
#!/usr/bin/env bash
# fxshot.sh <currency LYD|USD|EUR> <rail-cat> <page-label> <out.png|dom>
# Builds a login-bypassed copy that boots straight into <page-label> at <currency>, then screenshots or dumps DOM.
set -e
APP="/Users/yahyazobi/PETGO Finance /PETGO Vantage v3.html"
CUR="$1"; CAT="$2"; PAGE="$3"; OUT="$4"
TMP="$SCRATCH/_fx_boot.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BOOT="<script>try{localStorage.setItem('petgo_fx_cur','$CUR');}catch(e){}
window.addEventListener('load',function(){setTimeout(function(){
  try{var lg=document.getElementById('login-screen')||document.querySelector('.login-screen'); if(lg)lg.style.display='none';}catch(e){}
  try{var app=document.getElementById('app')||document.querySelector('.pv-dashboard'); if(app)app.style.display='';}catch(e){}
  try{var rb=document.querySelector('.pv-rail-btn[data-cat=\"$CAT\"]'); if(rb)rb.click();}catch(e){}
  try{if(window.pvGotoPage)pvGotoPage('$PAGE');}catch(e){}
},400);});</script>"
# inject before the LAST </body>
perl -0777 -pe 'BEGIN{$b=shift}$_ =~ s{(</body>)(?!.*</body>)}{$b$1}s' "$BOOT" "$APP" > "$TMP" 2>/dev/null || \
awk -v b="$BOOT" '{a[NR]=$0} END{for(i=1;i<=NR;i++){if(i==NR) sub(/<\/body>/,b"</body>",a[i]); print a[i]}}' "$APP" > "$TMP"
if [ "$OUT" = "dom" ]; then
  "$CHROME" --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom "file://$TMP"
else
  "$CHROME" --headless=new --disable-gpu --window-size=1600,1000 --virtual-time-budget=5000 --screenshot="$OUT" "file://$TMP"
fi
```

Note: the login-bypass selectors (`#login-screen`, `.pv-dashboard`, `pvGotoPage`, `data-cat`) are best-effort; on first run, adjust them to the app's real ids by inspecting the top of the file (`grep -n "login" "PETGO Vantage v3.html" | head`). Prefer reusing the project's known bypass pattern from memory `vantage-headless-screenshot`.

- [ ] **Step 11: Confirm Dashboard + a finance module both convert to USD.**

```bash
cd "/Users/yahyazobi/PETGO Finance "; chmod +x "$SCRATCH/fxshot.sh"
"$SCRATCH/fxshot.sh" USD Overview Dashboard "$SCRATCH/dash_usd.png"
"$SCRATCH/fxshot.sh" USD "Finance" "Budget tracker" dom | grep -oE "LD |\\$[0-9]" | sort | uniq -c
```
Expected: the Budget DOM dump shows `$`-prefixed figures and **no** `LD ` in data cells; `dash_usd.png` shows `$` KPIs. (Read `dash_usd.png` to confirm visually.)

- [ ] **Step 12: Commit**

```bash
git add "PETGO Vantage v3.html"
git commit -m "feat(currency): single header switch drives all modules via FX pub/sub"
```

---

### Task 3: Make charts currency-aware + literal-symbol sweep

Chart data arrays are raw USD-base numbers with hardcoded `'$'` tick labels. Convert data to the active currency at build time so bars scale, and swap literal symbols for `FX.symbol()`.

**Files:**
- Modify: `PETGO Vantage v3.html` — Analytics chart callbacks (~5498–5499), Budget-vs-Actual chart (6840), Invoice-aging chart (6857), and any remaining literal `'$'`/`'LD '`/`'€'` in render code.

**Interfaces:**
- Consumes: `FX.conv(amount,'USD')` → Number, `FX.symbol()` → String.

- [ ] **Step 1: Budget-vs-Actual — convert data + tick.** At line 6840, wrap the numeric arrays and fix the tick. Change the `data:budData` / `data:spentData` to `data:budData.map(function(x){return FX.conv(x,'USD');})` and `spentData.map(...)`, and change the tick callback `return '$'+v.toLocaleString();` to:

```js
return FX.symbol()+v.toLocaleString();
```

- [ ] **Step 2: Invoice-aging — convert data + tick.** At line 6857, map the `data:[aging.current,...]` array through `FX.conv(x,'USD')` and change the tick callback to `return FX.symbol()+v.toLocaleString();`.

- [ ] **Step 3: Analytics — convert charts.** Read lines 5490–5510 to see each `return '$'` site (there are ~4). For each chart, map its data array through `FX.conv(x,'USD')` and replace `'$'` in the tick/tooltip callback with `FX.symbol()`. Show the exact before/after for each in the commit.

- [ ] **Step 4: Sweep for any remaining hardcoded currency in render/chart code.**

Run:
```bash
cd "/Users/yahyazobi/PETGO Finance "
grep -nE "'\\$'|\"\\$\"|>\\$|'LD '|\"LD \"|'€'|\"€\"" "PETGO Vantage v3.html" \
  | grep -vE "FX-CORE|data-cur|ps-footer-note|disbursed in LYD"
```
Expected: no matches in render/chart code (only whitelisted labels remain). Fix any stragglers by routing through `formatCurrency`/`FX.symbol()`.

- [ ] **Step 5: Verify charts redraw in USD/EUR.**

```bash
"$SCRATCH/fxshot.sh" USD "Finance" "Budget tracker" "$SCRATCH/bud_usd.png"
"$SCRATCH/fxshot.sh" USD "Finance" "Invoices" "$SCRATCH/inv_usd.png"
"$SCRATCH/fxshot.sh" USD "Pipeline" "Analytics" "$SCRATCH/an_usd.png"
```
Read the three PNGs; expected: chart Y-axis ticks and figures show `$`, not `LD`.

- [ ] **Step 6: Commit**

```bash
git add "PETGO Vantage v3.html"
git commit -m "feat(currency): make Budget/Invoice/Analytics charts follow active currency"
```

---

### Task 4: Settings — Admin-editable exchange rates

Add an "Exchange Rates" card that edits the single rates table, persists it, and live-refreshes visible figures. Gate editing behind the existing latent Admin role.

**Files:**
- Modify: `PETGO Vantage v3.html` — add a static `.set-card` in the Settings page markup near the other set-cards (~after line 2573), add handler functions near `renderSettings` (7085–7101), and call a populate function from `renderSettings`.

**Interfaces:**
- Consumes: `FX.rates`, `FX.setRates(obj)`, `FX.defaults`, and the app's existing role check (find it: `grep -n "isAdmin\|role\|Admin" "PETGO Vantage v3.html" | head`). If no helper exists, define `function fxIsAdmin(){ return true; }` with a comment that every current login is Admin (ref spec: latent role at line 3243) and wire the gate through it.

- [ ] **Step 1: Add the Exchange Rates card markup** after the last existing `.set-card` (around line 2573):

```html
        <div class="pv-card set-card" id="set-fx-card">
          <div class="set-card-hdr"><div class="set-card-ttl">Exchange Rates</div>
            <div class="set-card-sub">Fixed rates used across every module. 1 LYD equals:</div></div>
          <div class="fn-field-row">
            <div class="fn-field"><label>USD ($) per 1 LYD</label><input id="fx-rate-usd" type="number" step="0.0001" min="0"></div>
            <div class="fn-field"><label>EUR (€) per 1 LYD</label><input id="fx-rate-eur" type="number" step="0.0001" min="0"></div>
          </div>
          <div class="set-fx-note" id="fx-rate-readonly" style="display:none;color:var(--pv-muted-2);font-size:12px;">Only an administrator can change exchange rates.</div>
          <div class="fn-modal-foot" id="fx-rate-actions">
            <button class="fn-cancel-btn" onclick="fxResetRates()">Reset to defaults</button>
            <button class="fn-save-btn" onclick="fxSaveRates()">Save rates</button>
          </div>
        </div>
```

(Match the class names actually used by neighboring set-cards — inspect one at line 2508 first and mirror its header/label classes.)

- [ ] **Step 2: Add handlers** near line 7101 (after `window.renderSettings=renderSettings;`):

```js
function fxIsAdmin(){ /* latent role system — every current login is Admin */ return true; }
function fxRenderRates(){
  var u=document.getElementById('fx-rate-usd'), e=document.getElementById('fx-rate-eur');
  if(!u||!e) return;
  u.value=FX.rates.USD; e.value=FX.rates.EUR;
  var admin=fxIsAdmin();
  u.disabled=!admin; e.disabled=!admin;
  document.getElementById('fx-rate-actions').style.display=admin?'':'none';
  document.getElementById('fx-rate-readonly').style.display=admin?'none':'';
}
function fxSaveRates(){
  if(!fxIsAdmin()) return;
  var usd=parseFloat(document.getElementById('fx-rate-usd').value),
      eur=parseFloat(document.getElementById('fx-rate-eur').value);
  if(FX.setRates({USD:usd, EUR:eur})){ showToast('Exchange rates updated'); fxRenderRates();
    var a=document.querySelector('.pv-page.is-active'); if(a&&a.dataset.page==='Settings') return; }
  else { showToast('Enter valid positive rates'); }
}
function fxResetRates(){ if(!fxIsAdmin()) return; FX.setRates({USD:FX.defaults.USD, EUR:FX.defaults.EUR}); fxRenderRates(); showToast('Exchange rates reset'); }
```

- [ ] **Step 3: Populate on Settings render.** Inside `renderSettings()` (7085), add a call to `fxRenderRates();` (near the end, before the closing brace). Confirm `renderSettings` is registered in `PV_PAGE_RENDER` (it is, line 7849) so `FX.onChange` re-rendering Settings keeps inputs in sync.

- [ ] **Step 4: Verify edit → persist → live update.**

```bash
# dump Settings DOM to confirm the card + seeded values render
"$SCRATCH/fxshot.sh" LYD "Settings" "Settings" dom | grep -oE 'id="fx-rate-(usd|eur)" [^>]*value="[0-9.]+"'
```
Expected: two inputs present, seeded `0.1634` / `0.191`. Then screenshot Settings to confirm layout: `"$SCRATCH/fxshot.sh" LYD "Settings" "Settings" "$SCRATCH/set.png"` and read it.

- [ ] **Step 5: Commit**

```bash
git add "PETGO Vantage v3.html"
git commit -m "feat(currency): Admin-editable exchange rates in Settings"
```

---

### Task 5: Payslip — dynamic currency labels

The payslip currently hardcodes LYD and its comment (4991–4993) says it should. Per the approved spec (user step 4), the displayed figure follows the toggle; keep a small "disbursed in LYD" legal note.

**Files:**
- Modify: `PETGO Vantage v3.html` — payslip comment (4991–4993), "in words" (4998), net-currency label (5041), footer note (5046).

**Interfaces:**
- Consumes: `FX.cur`, `formatCurrency`.
- Produces: a `_psCurName()` helper returning the full currency name for the active currency.

- [ ] **Step 1: Add a currency-name helper** near `_psMoney` (line 4994):

```js
function _psCurName(){ return {LYD:'Libyan Dinar (LYD)', USD:'US Dollar (USD)', EUR:'Euro (EUR)'}[FX.cur]; }
function _psCurWords(){ return {LYD:'Libyan Dinars', USD:'US Dollars', EUR:'Euros'}[FX.cur]; }
```

- [ ] **Step 2: Make the "in words" dynamic.** Replace line 4998:

```js
  var netWords=_psNumToWords(net)+' '+_psCurWords()+' Only';
```

- [ ] **Step 3: Make the net-currency label dynamic.** In line 5041 replace `<div class="ps-net-currency">Libyan Dinar (LYD)</div>` with `<div class="ps-net-currency">'+_psCurName()+'</div>`.

- [ ] **Step 4: Update the footer legal note** (5046) to keep the disbursement fact while noting display:

```js
  '<div class="ps-footer-note">This payslip is computer-generated. Salaries are disbursed in Libyan Dinar (LYD); figures above are shown in your selected display currency. For queries, contact the HR &amp; Finance department.</div>',
```

- [ ] **Step 5: Update the stale comment** at 4991–4993 to reflect the new behavior (payslip figures follow the display currency; disbursement remains LYD).

- [ ] **Step 6: Verify payslip converts.** Open a payslip in USD headless and dump:

```bash
"$SCRATCH/fxshot.sh" USD "Human Resources" "Payroll" "$SCRATCH/pay_usd.png"
```
Read `pay_usd.png`; open a payslip (adjust the boot script to click a payslip row if needed) and confirm the net figure shows `$`, the label reads "US Dollar (USD)", and the footer keeps the LYD disbursement note. (The `data-cat` for Payroll may differ — confirm with `grep -n 'data-cat' "PETGO Vantage v3.html" | head`.)

- [ ] **Step 7: Commit**

```bash
git add "PETGO Vantage v3.html"
git commit -m "feat(currency): payslip figures follow display currency, keep LYD disbursement note"
```

---

### Task 6: Full acceptance sweep

Prove no stray LD remains anywhere and conversions are correct across every module.

**Files:** none modified (verification only). Fixes discovered here fold back into the relevant task above.

- [ ] **Step 1: Whole-file static audit.**

```bash
cd "/Users/yahyazobi/PETGO Finance "
echo "--- residual formatters that must be gone ---"
grep -nE "currentCurrency|applyCurrency|CURRENCIES|PF_RATES|PF_SYM|CUR_MAP|state\.currency" "PETGO Vantage v3.html" || echo CLEAN
echo "--- literal symbols outside whitelist ---"
grep -nE "'\\$'|\"\\$\"|'LD '|\"LD \"|'€'|\"€\"" "PETGO Vantage v3.html" | grep -vE "FX-CORE|data-cur|disbursed in LYD|ps-footer-note" || echo CLEAN
```
Expected: `CLEAN` for both (or only whitelisted lines).

- [ ] **Step 2: Per-module DOM dump in USD — assert no `LD `.** For each module, dump and grep:

```bash
for M in "Overview:Dashboard" "Human Resources:Payroll" "Finance:Budget tracker" "Finance:Invoices" "Finance:Petty cash" "Finance:Expense claims" "Pipeline:Analytics" "Reports:Reports" "Pipeline:Overview" "Pipeline:Business Development" "Pipeline:Operations"; do
  CAT="${M%%:*}"; PG="${M##*:}";
  N=$("$SCRATCH/fxshot.sh" USD "$CAT" "$PG" dom | grep -oE "LD [0-9]" | wc -l | tr -d ' ')
  echo "$PG : LD-figures=$N"
done
```
Expected: `LD-figures=0` for every module in USD (rail category names are best-effort — fix any that don't navigate by checking real `data-cat` values first).

- [ ] **Step 3: Spot-check one known conversion per base.** In the Dashboard USD dump, confirm the cash KPI ≈ LYD×0.1634; in a Pipeline USD dump, confirm an opportunity value shows its native USD figure unchanged. Record the checks in the commit message.

- [ ] **Step 4: Interaction check (visual).** Screenshot the same module at LYD, USD, EUR and confirm figures + chart ticks change each time:

```bash
for C in LYD USD EUR; do "$SCRATCH/fxshot.sh" $C "Finance" "Budget tracker" "$SCRATCH/bud_$C.png"; done
```
Read all three; expected: symbols/values differ appropriately.

- [ ] **Step 5: Final commit (if any fold-back fixes were made) + summary.**

```bash
git add "PETGO Vantage v3.html"
git commit -m "test(currency): full cross-module acceptance sweep, no stray LD in USD" || echo "nothing to commit"
git log --oneline currency-centralization -8
```

---

## Self-Review

**Spec coverage:**
- One global state → Task 1 (`FX`) + Task 2 (single switch). ✓
- One rates table in Settings, Admin-editable, persisted → Task 4 + Task 1 (`setRates`/persistence). ✓
- One `formatCurrency` used everywhere → Task 1 (def) + Task 2 (wrappers) + Task 3 (charts) + Task 5 (payslip). ✓
- Audit every module (Payroll, Budget, Invoices, Expenses, Petty Cash, Analytics, Reports, Pipeline, Payslip PDFs) → Task 2 (wrappers cover call sites) + Task 3 (charts/literals) + Task 5 (payslip) + Task 6 (sweep). ✓
- Immediate re-render of visible module → Task 2 (pub/sub subscribers). ✓
- Mixed bases kept native, convert on display → Task 1 (`base` param) + per-site base assignment in Tasks 2/3/5. ✓
- EUR inconsistency removed → Task 2 Step 4/9 (delete `CURRENCIES`). ✓

**Placeholder scan:** Task 3 Step 3 (Analytics) and several verification steps say "read lines / adjust selectors" rather than exact code — this is deliberate because the login-bypass selectors and the 4 Analytics chart sites must be confirmed against the live file at execution time; each such step names the exact grep to locate them and the exact transform to apply. No `TBD`/`TODO`/"implement later".

**Type consistency:** `FX.conv` returns Number, `formatCurrency` returns String, used consistently (charts use `FX.conv`/`FX.symbol`; text uses `formatCurrency`). `fmtMoney`/`fmtLYD`/`_psMoney` keep their existing signatures so call sites are untouched. Wrapper `fmtMoney(v)` (finance, 1-arg) and Dashboard `fmtMoney(base,dec,unit,cur)` (4-arg) remain distinct scoped functions, both delegating to `formatCurrency` — no collision (different script blocks).

**Scope:** Single subsystem (currency), one file — appropriate for one plan.
