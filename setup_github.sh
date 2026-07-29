#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  PETGO CFO Dashboard — GitHub Setup Script
#  Run this once from your Terminal to create the repo and push.
#
#  Requires: git, gh (GitHub CLI)
#  Install gh if needed: brew install gh
# ─────────────────────────────────────────────────────────────

set -e

REPO_NAME="petgo-cfo-dashboard"
REPO_DESC="CFO Finance Dashboard for PETGO — single-file HTML app with Microsoft Graph integration, payroll, contracts, and HR modules"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "📁 Project folder: $PROJECT_DIR"
echo "📦 Repo name:      $REPO_NAME"
echo ""

# ── 1. Authenticate GitHub CLI if needed ───────────────────
if ! gh auth status &>/dev/null; then
  echo "🔑 Logging in to GitHub..."
  gh auth login
fi

# ── 2. Clean up any broken git state ───────────────────────
cd "$PROJECT_DIR"
rm -rf .git
echo "✓ Cleaned previous git state"

# ── 3. Init fresh repo ─────────────────────────────────────
git init -b main
git config user.name  "$(gh api user --jq .name 2>/dev/null || echo 'Yahya Zoubi')"
git config user.email "$(gh api user --jq .email 2>/dev/null || echo 'yahya.zoubi94@gmail.com')"
echo "✓ Git initialised"

# ── 4. Stage all files ─────────────────────────────────────
git add \
  "PETGO Finance CFO Dashboard.html" \
  "README.md" \
  "DASHBOARD_BUILD_GUIDE.md" \
  ".gitignore" \
  "server.py" \
  "config.json" \
  "requirements.txt" 2>/dev/null || true

# Add optional files if they exist
[ -f "start.sh" ]  && git add "start.sh"
[ -f "start.bat" ] && git add "start.bat"
[ -d "connectors" ] && git add "connectors/"

echo "✓ Files staged"

# ── 5. Initial commit ──────────────────────────────────────
git commit -m "Initial commit: PETGO Finance CFO Dashboard

Complete single-file CFO dashboard for PETGO Oil & Gas:
- Secure login with Microsoft MSAL + hard-coded allowed users
- Executive dashboard with KPI cards and charts
- Finance: Budget Tracker, Invoices, Expenses, Petty Cash, Projects
- HR/People: Leave, Payroll (+ payslip PDF), Contracts (+ PDF attach), Onboarding, Org Chart, Reviews
- Microsoft Graph API integration for live OneDrive/SharePoint Excel data
- Dark/Light theme, Global search, Notifications, Audit log, Backup/Restore
- Full project docs (README.md) and Presto replication guide (DASHBOARD_BUILD_GUIDE.md)"

echo "✓ Initial commit created"

# ── 6. Create GitHub repo ──────────────────────────────────
gh repo create "$REPO_NAME" \
  --private \
  --description "$REPO_DESC" \
  --source=. \
  --remote=origin \
  --push

echo ""
echo "✅ Done! Repo created and pushed."
echo "🔗 https://github.com/$(gh api user --jq .login)/$REPO_NAME"
echo ""
