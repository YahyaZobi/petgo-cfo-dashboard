"""
Database Connector — MySQL & PostgreSQL
========================================
Future-ready. Activate when PETGO moves to a database.

SETUP
─────
MySQL:
    pip install pymysql
    Set type = "mysql" in config.json

PostgreSQL:
    pip install psycopg2-binary
    Set type = "postgresql" in config.json

CONFIG EXAMPLE
──────────────
{
  "type":     "mysql",
  "host":     "db.petgo.ly",
  "port":     3306,
  "database": "petgo_finance",
  "username": "petgo_user",
  "password": "••••••••",
  "query":    "SELECT * FROM invoices WHERE archived = 0 ORDER BY due_date DESC",
  "column_map": {
    "inv_number":  "id",
    "client_name": "client",
    "total_amount": "amount"
  }
}
"""

from typing import Any, Dict, List

from .base import BaseConnector


class DatabaseConnector(BaseConnector):

    def fetch(self) -> List[Dict[str, Any]]:
        db_type = self.config.get("type", "mysql").lower()

        if db_type == "mysql":
            conn = self._connect_mysql()
        elif db_type == "postgresql":
            conn = self._connect_pg()
        else:
            raise ValueError(f"Unsupported database type: '{db_type}'")

        query     = self.config.get("query", "")
        col_map   = self.config.get("column_map", {})

        if not query:
            raise ValueError("No 'query' specified in config for this database source.")

        with conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows    = cur.fetchall()
                columns = [desc[0] for desc in cur.description]

        records = [dict(zip(columns, row)) for row in rows]

        # Apply column mapping
        if col_map:
            records = [
                {col_map.get(k, k): v for k, v in rec.items()}
                for rec in records
            ]

        return records

    # ── connection helpers ────────────────────────────────────────────────────

    def _connect_mysql(self):
        try:
            import pymysql
        except ImportError:
            raise RuntimeError(
                "pymysql not installed. Run:  pip install pymysql"
            )
        return pymysql.connect(
            host     = self.config["host"],
            port     = int(self.config.get("port", 3306)),
            db       = self.config["database"],
            user     = self.config["username"],
            password = self.config["password"],
            charset  = "utf8mb4",
        )

    def _connect_pg(self):
        try:
            import psycopg2
        except ImportError:
            raise RuntimeError(
                "psycopg2 not installed. Run:  pip install psycopg2-binary"
            )
        return psycopg2.connect(
            host     = self.config["host"],
            port     = int(self.config.get("port", 5432)),
            dbname   = self.config["database"],
            user     = self.config["username"],
            password = self.config["password"],
        )
