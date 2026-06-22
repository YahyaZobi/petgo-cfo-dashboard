"""
Base connector interface.
All connectors must implement fetch() and optionally test_connection().
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseConnector(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def fetch(self) -> List[Dict[str, Any]]:
        """
        Pull data from the source and return as a list of dicts.
        Each dict represents one row; keys are column names.
        """

    def test_connection(self) -> bool:
        """Quick smoke-test. Returns True if the source is reachable."""
        try:
            data = self.fetch()
            return isinstance(data, list)
        except Exception:
            return False
