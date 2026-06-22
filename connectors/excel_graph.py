"""
Excel — OneDrive / SharePoint Connector (Microsoft Graph API)
==============================================================
Reads an .xlsx file stored in OneDrive for Business or SharePoint
using the Microsoft Graph API. Reuses the same Azure AD app registration
as your PETGO Microsoft login.

──────────────────────────────────────────────────────────────────────────
AUTH OPTIONS  (choose one, add to config.json source entry)
──────────────────────────────────────────────────────────────────────────

Option A – Client Credentials (recommended for background refresh):
    "tenant_id":     "your-azure-tenant-id",
    "client_id":     "your-app-client-id",
    "client_secret": "your-app-client-secret"

Option B – Pass-through access token (from the user's login session):
    "access_token":  "<token-from-ms-login>"

──────────────────────────────────────────────────────────────────────────
FILE LOCATION  (choose one)
──────────────────────────────────────────────────────────────────────────

OneDrive (personal drive of the signed-in user):
    "file_path": "Finance/Invoices.xlsx"

OneDrive for Business (specific drive by ID):
    "drive_id":  "b!xxxxxxxxxxxxxxxxxxxx",
    "file_path": "Finance/Invoices.xlsx"

SharePoint site:
    "site_id":   "yourcompany.sharepoint.com,<site-guid>,<web-guid>",
    "file_path": "Shared Documents/Finance/Invoices.xlsx"

──────────────────────────────────────────────────────────────────────────
OTHER FIELDS
──────────────────────────────────────────────────────────────────────────
    "sheet":      "Sheet1"   (name or 0-based index)
    "skip_rows":  0
    "column_map": {"Excel Header": "dashboard_key"}
"""

from io import BytesIO
from typing import Any, Dict, List

import pandas as pd
import requests

from .base import BaseConnector

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOKEN_URL  = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


class ExcelGraphConnector(BaseConnector):

    # ── auth ──────────────────────────────────────────────────────────────────

    def _get_token(self) -> str:
        """Returns a valid Bearer token via client-credentials or pass-through."""
        if "access_token" in self.config:
            return self.config["access_token"]

        required = ("tenant_id", "client_id", "client_secret")
        missing  = [k for k in required if k not in self.config]
        if missing:
            raise ValueError(
                f"Microsoft Graph auth not configured. "
                f"Missing: {missing}. See connectors/excel_graph.py for setup instructions."
            )

        resp = requests.post(
            TOKEN_URL.format(tenant=self.config["tenant_id"]),
            data={
                "grant_type":    "client_credentials",
                "client_id":     self.config["client_id"],
                "client_secret": self.config["client_secret"],
                "scope":         "https://graph.microsoft.com/.default",
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    # ── file download ─────────────────────────────────────────────────────────

    def _build_content_url(self) -> str:
        fp = self.config["file_path"].lstrip("/")

        if "site_id" in self.config:
            return f"{GRAPH_BASE}/sites/{self.config['site_id']}/drive/root:/{fp}:/content"

        if "drive_id" in self.config:
            return f"{GRAPH_BASE}/drives/{self.config['drive_id']}/root:/{fp}:/content"

        # Fall back to the authenticated user's default OneDrive
        return f"{GRAPH_BASE}/me/drive/root:/{fp}:/content"

    # ── main ──────────────────────────────────────────────────────────────────

    def fetch(self) -> List[Dict[str, Any]]:
        token   = self._get_token()
        headers = {"Authorization": f"Bearer {token}"}
        url     = self._build_content_url()

        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()

        df = pd.read_excel(
            BytesIO(resp.content),
            sheet_name=self.config.get("sheet", 0),
            skiprows=self.config.get("skip_rows", 0),
            engine="openpyxl",
        )
        return self._clean(df)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _clean(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        df = df.dropna(how="all").reset_index(drop=True)
        df = df.dropna(axis=1, how="all")

        col_map = self.config.get("column_map", {})
        if col_map:
            df = df.rename(columns=col_map)

        df.columns = [str(c).strip() for c in df.columns]

        for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%d")

        df = df.where(pd.notnull(df), None)
        return df.to_dict(orient="records")
