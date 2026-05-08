"""Pytest configuration for notification service tests."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
_shared = Path(__file__).parent.parent.parent.parent / "shared"
sys.path.insert(0, str(_shared / "schemas"))
sys.path.insert(0, str(_shared / "proto"))
