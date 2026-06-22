"""
Excel Local / Network Drive Connector
=======================================
Reads any .xlsx file on this machine or a mapped network drive.

Config fields:
  path         (str)  – Absolute path to the .xlsx file.
                         Examples:
                           "C:/PETGO/Finance/Invoices.xlsx"
                           "/Users/yahya/PETGO Finance/Data/Invoices.xlsx"
                           "//server/share/Finance/Invoices.xlsx"
  sheet        (str|int) – Sheet name or 0-based index. Default: 0
  skip_rows    (int)  – Rows to skip before the header. Default: 0
  column_map   (dict) – Rename columns: {"Excel Header": "dashboard_key"}
  enabled      (bool) – Set false to disable without removing config.
"""

from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from .base import BaseConnector


class ExcelLocalConnector(BaseConnector):

    def fetch(self) -> List[Dict[str, Any]]:
        path = Path(self.config["path"])

        if not path.exists():
            raise FileNotFoundError(
                f"Excel file not found: {path}\n"
                f"Check the 'path' value in config.json for this source."
            )

        sheet     = self.config.get("sheet", 0)
        skip_rows = self.config.get("skip_rows", 0)

        df = pd.read_excel(path, sheet_name=sheet, skiprows=skip_rows, engine="openpyxl")
        return self._clean(df)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _clean(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        # Drop completely empty rows/columns
        df = df.dropna(how="all").reset_index(drop=True)
        df = df.dropna(axis=1, how="all")

        # Rename columns using mapping
        col_map = self.config.get("column_map", {})
        if col_map:
            df = df.rename(columns=col_map)

        # Normalise column names (strip whitespace)
        df.columns = [str(c).strip() for c in df.columns]

        # Convert datetime columns to ISO date strings
        for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%d")

        # Replace NaN / NaT / inf with None (JSON-safe)
        df = df.where(pd.notnull(df), None)

        return df.to_dict(orient="records")
