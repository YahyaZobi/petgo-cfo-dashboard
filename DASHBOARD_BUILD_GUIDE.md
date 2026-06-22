# CFO Dashboard — Replication Guide
## How to Build the Next Version (e.g. Presto)

This guide documents exactly how the PETGO CFO Dashboard was built so the next company dashboard can be created faster and more predictably. Follow the phases in order.

---

## Before You Start — Collect These from the Client

Before touching any code, gather:

| Item | Example (PETGO) | Notes |
|---|---|---|
| Company name | PETGO | Used in branding, payslip, emails |
| Allowed user emails | karen.mombay@petgo.ly | Hard-coded access list |
| Finance contact email | finance@petgo.ly | Shown in payslip footer |
| Default currency | LYD | Can be changed in Settings |
| Company address / city | Tripoli, Libya | Payslip footer |
| Employee list | Name, Title, Dept, Email | Seed data for directory + payroll |
| Salary data | Name, Base, Deductions, Month | Seed data for payroll |
| Contract data | Name, Type, End Date | Seed data for contracts |
| Azure App credentials (optional) | Client ID + Tenant ID | Only if using live Excel data |
| OneDrive/SharePoint file paths | /Finance/Budgets.xlsx | Only if using live Excel data |
| Primary brand colour | #2B7FE8 (blue) | Used for accents, active states |

---

## Phase 1 — Shell & Login (Day 1)

**Goal:** A working HTML file with a login screen that gatekeeps access.

### 1.1 Create the HTML file
Start with a single `.html` file. No frameworks, no bundler, no npm. Everything is inline.

Structure:
```
<!DOCTYPE html>
<html>
  <head>
    <!-- CDN scripts: XLSX.js, MSAL.js -->
    <style>/* all CSS here */</style>
  </head>
  <body>
    <!-- Login overlay -->
    <!-- Main app (hidden until logged in) -->
    <script>/* all JS here */</script>
  </body>
</html>
```

### 1.2 Add CDN dependencies
```html
<!-- Excel parsing -->
<script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
<!-- Microsoft Auth (optional — add now so it's ready) -->
<script src="https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js" crossorigin="anonymous"></script>
```

### 1.3 Build the login screen
- Full-screen overlay (`position:fixed; inset:0; z-index:1000`)
- Dark background with animated gradient orbs (purely cosmetic)
- Email input → Next → Password input (or MSAL popup if configured)
- Hard-coded allowed emails array:
  ```javascript
  var ALLOWED = ['user@company.com'];
  ```
- On success: hide overlay, call `bootApp()`

### 1.4 `bootApp()` function
Runs once on successful login. Calls all `render*()` functions for each module. Loads data from localStorage. Sets up the active panel.

**Key pattern:** Every module has `renderX()` which reads from a `var X = fnLoad('key', defaultArray)` and writes to a `<tbody id="x-tbody">`.

---

## Phase 2 — Layout & Sidebar (Day 1–2)

**Goal:** The main two-panel layout (sidebar + content area) with working navigation.

### 2.1 CSS variables (design tokens)
Define all colours as CSS variables on `:root` for easy theming:
```css
:root {
  --sb: #0d1117;         /* sidebar background */
  --bg: #0a0f1e;         /* main background */
  --card: #111827;       /* card/panel background */
  --acc: #2B7FE8;        /* accent (primary brand colour) */
  --t1: #f1f5f9;         /* primary text */
  --t2: rgba(255,255,255,0.55); /* secondary text */
  --tm: rgba(255,255,255,0.35); /* muted text */
  --cb: rgba(255,255,255,0.08); /* card border */
  --inp: rgba(255,255,255,0.04); /* input background */
  --sb-width: 224px;
}
```

For light theme, override the same variables on `[data-theme="light"]`.

### 2.2 Sidebar HTML structure
```html
<aside class="sb">
  <div class="sb-logo">
    <!-- Company name/logo -->
  </div>
  <div class="sb-nav-scroll">  <!-- scrollable, flex:1, overflow-y:auto -->
    <div class="sb-section">Menu</div>
    <ul class="sb-nav" id="sb-nav">
      <!-- nav items -->
    </ul>
    <div class="sb-section">Finance</div>
    <ul class="sb-nav">...</ul>
    <div class="sb-section">People</div>
    <ul class="sb-nav">...</ul>
  </div>
  <!-- Pinned bottom: theme toggle + logout -->
  <div class="sb-bottom">...</div>
</aside>
```

**Critical:** `.sb-nav-scroll` must have `flex:1; overflow-y:auto; min-height:0` or the logout button gets clipped.

### 2.3 Navigation function
```javascript
function navTo(panel, el) {
  // Hide all .cp panels
  document.querySelectorAll('.cp').forEach(p => p.style.display = 'none');
  // Show target panel
  document.getElementById('panel-' + panel).style.display = 'block';
  // Update active nav item
  document.querySelectorAll('.sb-nav li').forEach(li => li.classList.remove('active'));
  if (el) el.classList.add('active');
}
```

### 2.4 Active nav item styling
```css
.sb-nav li.active {
  background: linear-gradient(135deg, rgba(43,127,232,0.24), rgba(43,127,232,0.07));
  color: #7ec8fb;
}
.sb-nav li.active::before {
  content: '';
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 58%;
  background: linear-gradient(180deg, #60a5fa, #3b82f6);
  border-radius: 0 3px 3px 0;
}
```

---

## Phase 3 — Data Layer (Day 2)

**Goal:** Reusable localStorage helpers and the pattern every module follows.

### 3.1 Core helper functions
```javascript
function fnLoad(key, def) {
  try { var d = localStorage.getItem(key); return d ? JSON.parse(d) : def; } catch(e) { return def; }
}
function fnSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}
function fnId() { return Date.now() + Math.floor(Math.random() * 1000); }
function escH(s) { /* HTML escape */ }
function fmtMoney(n) { /* format as currency */ }
function fmtDate(s) { /* format YYYY-MM-DD to readable */ }
```

### 3.2 Module data pattern (repeat for every module)
```javascript
// 1. Load (with seed defaults)
var invoices = fnLoad('co_invoices', [ /* seed data */ ]);

// 2. Save
function saveInvoiceStore() { fnSave('co_invoices', invoices); }

// 3. Render
function renderInvoices() {
  var tb = document.getElementById('inv-tbody');
  tb.innerHTML = invoices.map(function(inv, i) {
    return '<tr><td>...</td><td>...</td></tr>';
  }).join('');
}

// 4. Open modal (add or edit)
function openInvModal(idx) { ... }

// 5. Save modal
function saveInv() { ... saveInvoiceStore(); renderInvoices(); }

// 6. Delete
function delInv(idx) { invoices.splice(idx,1); saveInvoiceStore(); renderInvoices(); }
```

### 3.3 Seed data
Populate default arrays with real company data provided by the client. This means the app feels complete on first open — no empty states.

---

## Phase 4 — Finance Modules (Day 2–4)

Build in this order (each follows the same pattern from Phase 3):

1. **Budget Tracker** — simplest, just dept/category/budgeted/actual
2. **Invoices** — add status badges and due-date colouring
3. **Petty Cash** — running balance calculation
4. **Expense Claims** — add approve/reject buttons
5. **Projects** — add budget vs spent visualisation

For each module, the HTML panel is:
```html
<div id="panel-fin-invoices" class="cp">
  <div class="ptitle"><div class="pdot"></div>Invoices</div>
  <div class="fn-kpi-row" id="inv-kpis"></div>
  <div class="fn-card">
    <div class="fn-tbar">
      <div class="fn-tbar-left">
        <span class="fn-tbar-title">Invoice Register</span>
        <!-- filters -->
      </div>
      <div>
        <button class="exp-btn" onclick="exportFnTable(...)">Excel</button>
        <button class="fn-add-btn" onclick="openInvModal()">+ Add</button>
      </div>
    </div>
    <div class="fn-tbl-wrap">
      <table class="fn-tbl" id="inv-tbl">
        <thead>...</thead>
        <tbody id="inv-tbody"></tbody>
      </table>
    </div>
  </div>
</div>
```

**KPI helper** (reuse for every module):
```javascript
function fnKpi(label, value, sub, bgColor, textColor, icon) {
  return '<div class="fn-kpi-card" style="background:'+bgColor+'">...'
}
```

---

## Phase 5 — HR / People Modules (Day 4–6)

Build in this order:

1. **Leave Tracker** — date arithmetic, status badges, calendar view
2. **Payroll** — month selector, salary calculations
3. **Contracts** — expiry tracking, days-remaining logic, urgency colours
4. **Onboarding** — checklist per employee
5. **Org Chart** — auto-generated from employee directory
6. **Performance Reviews** — rating + notes

**Date helper** (critical for Leave and Contracts):
```javascript
function today() { return new Date().toISOString().split('T')[0]; }
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
```

**Urgency colour logic** (for contracts/deadlines):
```javascript
var cls = days < 0 ? 'fn-overdue' : days <= 30 ? 'fn-urgent-r' : days <= 60 ? 'fn-urgent-y' : 'fn-urgent-g';
```

---

## Phase 6 — Employee Directory (Day 6)

The employee directory is the backbone — it feeds the org chart, payroll cross-reference, and contract lookup.

```javascript
var STAFF_DIR = [
  {id:1, name:'CEO Name', title:'CEO', dept:'Executive', email:'ceo@company.com', phone:''},
  // ... all employees
];
var employees = [];  // user-added employees (from localStorage)

function loadEmployees() {
  var saved = localStorage.getItem('co_employees');
  employees = saved ? JSON.parse(saved) : [];
}
```

**Cross-referencing** in payslip generation:
```javascript
var allStaff = STAFF_DIR.concat(employees || []);
var emp = allStaff.find(function(e){ return e.name === p.name; }) || {};
```

---

## Phase 7 — Payslip PDF Export (Day 7)

The payslip is a standalone HTML document rendered in a new window and printed to PDF.

### Key function: `buildPayslipHTML(p, empTitle, empId, slipNo, issueDate)`
Returns a full HTML string for an A4-style payslip with:
- Company branding header (dark navy gradient)
- Employee info grid (2 columns)
- Earnings table
- Deductions table
- Net Pay block (large, highlighted)
- "Amount in words" (see `_psNumToWords()`)
- Authorised signatory footer

### Print flow:
```javascript
function printPayslip() {
  var html = document.getElementById('ps-doc').innerHTML;
  var styles = /* collect all CSS from document.styleSheets */;
  var win = window.open('', '_blank', 'width=800,height=1050');
  win.document.write('<!DOCTYPE html><html><head><style>' + styles + '</style></head><body>' + html + '</body></html>');
  win.document.close();
  setTimeout(function(){ win.print(); }, 700);
}
```

**Net pay in words** (for international standard payslips):
```javascript
function _psNumToWords(n) {
  var ones = ['','One','Two',...,'Nineteen'];
  var tens = ['','','Twenty','Thirty',...,'Ninety'];
  // Handle millions, thousands, hundreds, tens, ones recursively
}
```

---

## Phase 8 — Contract File Attachments (Day 7–8)

Store PDFs as base64 in localStorage, separate from the contract record (to avoid JSON size issues):

```javascript
// Upload
reader.readAsDataURL(file);
reader.onload = function(e) {
  localStorage.setItem('co_con_pdf_' + contractId, e.target.result);
};

// View
var data = localStorage.getItem('co_con_pdf_' + id);
var win = window.open('');
win.document.write('<iframe src="' + data + '" style="width:100%;height:100vh"></iframe>');

// Delete (always clean up when deleting a contract)
localStorage.removeItem('co_con_pdf_' + c.id);
```

**File size limit:** 8MB — larger PDFs will approach localStorage limits (typically 5–10MB per origin).

---

## Phase 9 — Microsoft Graph Integration (Day 8–9)

This allows each module to pull live data from Excel files on OneDrive or SharePoint.

### MSAL Setup
```javascript
_msalInstance = new msal.PublicClientApplication({
  auth: {
    clientId: GRAPH_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/' + GRAPH_TENANT_ID,
    redirectUri: window.location.href.split('?')[0]
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
});
```

### Download an Excel file from Graph
```javascript
async function _graphDownloadExcel(filePath) {
  var token = await _msalGetToken();
  var url;
  if (filePath.startsWith('https://')) {
    // SharePoint URL
    var encoded = 'u!' + btoa(filePath).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    url = 'https://graph.microsoft.com/v1.0/shares/' + encoded + '/driveItem/content';
  } else {
    // OneDrive path
    url = 'https://graph.microsoft.com/v1.0/me/drive/root:' + filePath + ':/content';
  }
  var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  return await resp.arrayBuffer();
}
```

### Parse Excel and write to localStorage
```javascript
var buffer = await _graphDownloadExcel(src.path);
var wb = XLSX.read(buffer, { type: 'array' });
var data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
_applyAPIData(module, data);  // writes to localStorage + live JS arrays
```

### Azure App Registration (required for Graph)
1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Name: `[Company] CFO Dashboard`
3. Supported account types: **Single tenant**
4. No redirect URI needed (or set to `file:///` if using locally)
5. After creating: **API permissions** → Add → Microsoft Graph → Delegated:
   - `User.Read`
   - `Files.Read`
   - `Files.Read.All`
   - `Sites.Read.All`
6. Copy **Application (client) ID** and **Directory (tenant) ID**
7. Paste both into the dashboard Settings → Data Sources

---

## Phase 10 — Polish (Day 9–10)

### Global Search
```javascript
function doSearch(q) {
  var results = [];
  // Search each module array:
  (invoices||[]).forEach(function(inv) {
    if (inv.vendor.toLowerCase().includes(q)) results.push({...});
  });
  // ... repeat for all modules
  renderSearchResults(results);
}
```

### Notifications
Auto-generated from data state:
- Contracts expiring in <30 days → "Critical: X contracts expiring soon"
- Invoices overdue → "Y invoices past due date"
- Pending expense claims → "Z claims awaiting approval"

### Dark/Light Theme
```javascript
function toggleTheme(isDark) {
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('petgo_theme', isDark ? 'dark' : 'light');
}
```

### Print CSS
```css
@media print {
  .sb, .hdr, .fn-modal, #ms-overlay { display: none !important; }
  .main { margin: 0 !important; }
  .content { padding: 0 !important; overflow: visible !important; }
}
```

### Excel Export (per table)
```javascript
function exportFnTable(tableId, name) {
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.table_to_sheet(document.getElementById(tableId));
  XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.writeFile(wb, name + ' ' + new Date().toLocaleDateString() + '.xlsx');
}
```

---

## Customisation Checklist for Presto

When starting the Presto build, change these things from the PETGO template:

### Identity (find & replace)
- `PETGO` → `Presto` (company name in sidebar, payslip, footer)
- `petgo_` → `presto_` (all localStorage key prefixes)
- `finance@petgo.ly` → `finance@presto.com` (payslip footer email)
- `PETGO, Tripoli, Libya` → Presto's address
- `karen.mombay@petgo.ly`, `yahya.zoubi@petgo.ly` → Presto allowed users

### Brand colour
- `#2B7FE8` → Presto's primary colour (change in `:root` and anywhere hardcoded in gradient strings)

### Seed data
- `STAFF_DIR` array → Presto employees
- Default `payroll` array → Presto salary data
- Default `contracts` array → Presto contracts

### Modules to add / remove
- Confirm with Presto which modules they need
- Remove any Finance or HR panels not required (delete the `panel-*` div + nav li + render call in bootApp)
- Add any new modules following the Phase 3 pattern

### Currency
- Change default currency in the currency selector seed value

### Language
- If Presto needs Arabic, keep the i18n map; if English-only, remove it

---

## Common Pitfalls & How to Avoid Them

| Pitfall | What Happens | Fix |
|---|---|---|
| Sidebar logout button clipped | Bottom section disappears on short screens | Add `.sb-nav-scroll { flex:1; overflow-y:auto; min-height:0 }` wrapper around nav sections |
| localStorage quota exceeded | PDF attachments or large datasets cause silent write failures | Store PDFs separately from data objects; enforce 8MB file limit |
| MSAL popup blocked | Browser blocks login popup | Must be triggered directly by user click (not setTimeout) |
| Print styles bleeding into modal | Payslip CSS conflicts with normal print CSS | Use `body.ps-print-mode` class to scope payslip print styles |
| Cross-month payroll filtering | renderPayroll shows wrong month | Always filter by `sel.value` not array index |
| Contract PDF not deleted | Orphaned base64 in localStorage after contract delete | Always call `localStorage.removeItem('co_con_pdf_'+c.id)` in `delCon()` |
| Azure app with personal Microsoft account | Registration page shows "no applications" | Must use **work/school** account (e.g. user@company.com), not personal Gmail |
| SharePoint URL base64 encoding | Graph API 404 on SharePoint files | Use `'u!' + btoa(url).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')` |

---

## Estimated Build Timeline for Presto

| Phase | Task | Days |
|---|---|---|
| 0 | Collect all client data (see checklist above) | 0.5 |
| 1 | Shell + Login screen | 0.5 |
| 2 | Layout + Sidebar | 0.5 |
| 3 | Data layer helpers | 0.5 |
| 4 | Finance modules (5) | 2 |
| 5 | HR modules (6) | 2 |
| 6 | Employee directory | 0.5 |
| 7 | Payslip PDF export | 0.5 |
| 8 | Contract file attachments | 0.5 |
| 9 | Microsoft Graph (if needed) | 1 |
| 10 | Polish + search + notifications | 1 |
| — | **Total** | **~9–10 days** |

With the PETGO file as a starting template (find-and-replace company identity), this drops to **3–4 days**.

---

## Starting from the PETGO Template (Fastest Path)

1. Copy `PETGO Finance CFO Dashboard.html` → `Presto Finance CFO Dashboard.html`
2. Open in a text editor and do a case-sensitive find-and-replace:
   - `PETGO` → `Presto`
   - `petgo_` → `presto_` (localStorage keys)
   - `petgo.ly` → `presto.com` (email domains)
3. Update `ALLOWED` array with Presto user emails
4. Update `STAFF_DIR` with Presto employees
5. Update seed data arrays (payroll, contracts)
6. Change `--acc` colour variable to Presto's brand colour
7. Update company address in payslip footer
8. Test login, navigation, and data entry
9. Configure Azure + Graph if live Excel data is needed
