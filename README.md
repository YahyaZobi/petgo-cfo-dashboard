# PETGO Finance CFO Dashboard

A self-contained, single-file HTML financial operations dashboard built for PETGO's CFO and finance team. No server, no database — runs entirely in the browser with localStorage for persistence and optional Microsoft Graph API for live Excel data.

---

## Quick Start

1. Open `PETGO Finance CFO Dashboard.html` in any modern browser (Chrome recommended)
2. Log in with an authorised email (`karen.mombay@petgo.ly` or `yahya.zoubi@petgo.ly`)
3. All data is saved automatically in the browser's localStorage

---

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Single HTML file | No build step, no server |
| Styling | Inline CSS (CSS variables) | Dark/light theme via `data-theme` |
| Data storage | `localStorage` | Persists across sessions on same machine |
| Excel parsing | XLSX.js (CDN) | Client-side, no upload needed |
| Authentication | MSAL.js 2.38.3 (CDN) | Optional — enables real Microsoft login |
| Live data | Microsoft Graph API | OneDrive / SharePoint Excel downloads |
| PDF export | Browser Print API | Opens a new window, auto-triggers print |
| Charts | Native Canvas (hand-coded) | No Chart.js dependency |

---

## Access Control

Two users are hard-coded as allowed:

```javascript
var ALLOWED = ['karen.mombay@petgo.ly', 'yahya.zoubi@petgo.ly'];
```

**Demo mode** (no Azure): users enter email + password (any password accepted for allowed emails).  
**Microsoft Graph mode** (Azure configured): real MSAL popup login — Microsoft verifies the user.

---

## Feature Map

### Navigation (Left Sidebar)
- Modern dark sidebar with section grouping (Menu · Finance · People)
- Active state with left blue accent bar + gradient highlight
- Scrollable nav area; Sign Out button always pinned at bottom
- Responsive: collapses to icon-only at <900px

---

### Menu Section

#### Dashboard (Executive Overview)
- KPI summary cards: Total Revenue, Expenses, Net Profit, Headcount
- Revenue vs Expenses trend chart
- Recent activity feed
- Announcement banner

#### Analytics
- Cross-module data visualisation
- Pivot-detection smart chart engine — automatically selects best chart type

#### Documents (My Documents)
- Upload, view, and delete files (stored as base64 in localStorage)
- File type icons, file size display

#### Team Directory
- Lists all employees with photo, title, department, email, phone
- Photos stored as base64 (upload per employee)
- Integrated with other modules (payroll cross-reference, org chart)

#### Audit Log
- Timestamped record of all create/edit/delete actions across modules
- Exportable

#### Settings
- **Language**: Arabic / English toggle with full i18n string map
- **Currency**: LYD / USD / EUR with live symbol swap
- **Data Sources**: Microsoft Graph configuration (Client ID, Tenant ID, per-module OneDrive/SharePoint paths)
- **Backup & Restore**: Download full JSON backup, restore from file
- **Notifications**: Email digest toggle, threshold config

---

### Finance Section

#### Budget Tracker
- Departments × Categories budget grid
- Budget vs Actual comparison with variance %
- Visual chart (bar: budgeted vs actual per department)
- Add / Edit / Delete entries; Excel export

#### Invoices
- Invoice list with vendor, amount, due date, status
- Status badges: Paid / Pending / Overdue / Draft
- Invoice aging chart
- Add / Edit / Delete; Excel export

#### Expense Claims
- Employee expense submissions with category, amount, status
- Approve / Reject workflow
- Excel export

#### Petty Cash
- Cash transactions log (in/out)
- Running balance calculation
- Category breakdown

#### Projects
- Project budget tracking
- Budget vs Spent per project
- Status: Active / On Hold / Completed

---

### People (HR) Section

#### Leave Tracker
- Leave requests with type (Annual / Sick / Emergency / Unpaid)
- Status: Pending / Approved / Rejected
- Calendar view showing leave periods
- Days-remaining calculation

#### Payroll
- Monthly salary register per employee
- Fields: Employee ID, Name, Department, Base Salary, Deductions, Net Pay, Month
- KPI cards: Total Net Payroll, Headcount, Average Base Salary, Total Deductions
- Month selector to view different pay periods
- **Payslip PDF export** — per-employee, opens print-ready A4 document with:
  - PETGO branding header (dark navy gradient)
  - Employee info grid (Name, ID, Department, Job Title, Pay Period, Issue Date)
  - Earnings table (Basic Salary → Total Gross)
  - Deductions table (in red)
  - Net Pay block (large amount + amount in words)
  - Authorised signatory footer

#### Contracts
- Contract expiry tracking with colour-coded urgency (Critical / Warning / Active / Expired)
- Filter by expiry window (<30 / <60 / <90 days)
- Fields: Employee, Department, Job Title, Contract Type, End Date
- **Job Description**: freetext field, viewable in dedicated modal
- **PDF Attachment**: upload and store the actual signed contract (up to 8MB, base64 in localStorage)
- "PDF" and "JD" action buttons appear inline in the table

#### Onboarding
- New employee onboarding checklist tracker
- Task completion status per employee

#### Org Chart
- Auto-generated from employee directory
- CEO at top, departments as nodes, employees as leaves

#### Performance Reviews
- Review cycles with rating and notes
- Status tracking: Pending / In Progress / Completed

---

### Cross-Cutting Features

| Feature | Description |
|---|---|
| Global Search | Searches across all modules simultaneously; click result to navigate |
| Announcements Board | Post and manage company announcements |
| Smart Notifications | Alerts for expiring contracts, overdue invoices, pending approvals |
| Dark / Light Theme | Toggle in sidebar bottom; preference saved in localStorage |
| Print CSS | Any panel can be printed cleanly (sidebar/header hidden) |
| Excel Export | Every table has an "Excel" button using XLSX.js |
| Data Backup | Full JSON export/import from Settings → Backup |

---

## Microsoft Graph Integration (Optional)

When configured, each module can pull live data from an Excel file stored in OneDrive or SharePoint.

**Setup steps:**
1. Register an app in Azure Active Directory (Entra ID)
2. Add permissions: `User.Read`, `Files.Read`, `Files.Read.All`, `Sites.Read.All`
3. Copy **Client ID** and **Tenant ID** into Settings → Data Sources
4. Toggle **Graph Mode ON**
5. For each module, paste the OneDrive file path or full SharePoint URL

**Supported URL formats:**
- OneDrive path: `/Finance/Budgets 2026.xlsx`
- SharePoint URL: `https://petgo.sharepoint.com/sites/finance/...`

Data flows: Microsoft → browser (MSAL token) → XLSX.js parse → localStorage write → UI render.  
No data ever touches an external server.

---

## Data Storage Keys (localStorage)

| Key | Content |
|---|---|
| `petgo_budgets` | Budget entries array |
| `petgo_invoices` | Invoice entries array |
| `petgo_petty` | Petty cash transactions |
| `petgo_projects` | Project entries |
| `petgo_expenses` | Expense claims |
| `petgo_leaves` | Leave requests |
| `petgo_payroll` | Payroll entries |
| `petgo_contracts` | Contract records |
| `petgo_onboarding` | Onboarding checklists |
| `petgo_reviews` | Performance reviews |
| `petgo_employees` | Employee directory |
| `petgo_audit_log` | Audit trail |
| `petgo_announcements` | Announcements |
| `petgo_con_pdf_{id}` | Attached contract PDF (base64) |
| `petgo_client_id` | Azure App Client ID |
| `petgo_tenant_id` | Azure Tenant ID |
| `petgo_graph_mode` | Graph mode on/off flag |
| `petgo_ds_config` | Per-module data source config |

---

## Customisation Checklist (for new deployments)

- [ ] Replace `ALLOWED` emails array with new company's user emails
- [ ] Replace `PETGO` brand name in sidebar logo and payslip header
- [ ] Replace `finance@petgo.ly` in payslip footer
- [ ] Update `STAFF_DIR` default employee array with actual staff
- [ ] Update default `payroll` array with actual salaries
- [ ] Update default `contracts` array with actual contracts
- [ ] Set company address in payslip footer
- [ ] Update currency default if not LYD
- [ ] Configure Azure app and paste Client ID / Tenant ID into Settings

---

## File Structure

```
PETGO Finance /
├── PETGO Finance CFO Dashboard.html   ← The entire app (single file)
├── server.py                           ← Legacy FastAPI server (no longer needed)
├── config.json                         ← Legacy config (replaced by localStorage)
├── requirements.txt                    ← Python deps for server.py
├── README.md                           ← This file
└── DASHBOARD_BUILD_GUIDE.md           ← Replication guide for Presto
```
