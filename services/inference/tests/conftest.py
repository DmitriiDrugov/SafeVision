"""Pytest configuration for inference service tests."""
import sys
from pathlib import Path

# Make inference package importable from src/
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
# Make shared schemas importable
_shared = Path(__file__).parent.parent.parent.parent / "shared"
sys.path.insert(0, str(_shared / "schemas"))
sys.path.insert(0, str(_shared / "proto"))
