"""
Tests that Alembic migrations produce the correct schema.

These are integration tests that run alembic upgrade head against a real
(temporary) SQLite file and then inspect the resulting schema.
"""

import os
import pytest
from pathlib import Path
from sqlalchemy import create_engine, inspect as sa_inspect


BACKEND_DIR = Path(__file__).parent.parent


def _run_upgrade(db_url: str) -> None:
    from alembic.config import Config
    from alembic import command

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")


# ---------------------------------------------------------------------------
# Tracer bullet: full schema is created from a blank DB
# ---------------------------------------------------------------------------

def test_upgrade_head_creates_all_tables(tmp_path):
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"

    _run_upgrade(url)

    engine = create_engine(url)
    tables = sa_inspect(engine).get_table_names()
    engine.dispose()

    assert "runs" in tables
    assert "leads" in tables
    assert "gap_signals" in tables
    assert "notes" in tables
    assert "alembic_version" in tables


def test_upgrade_head_includes_progress_columns(tmp_path):
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"

    _run_upgrade(url)

    engine = create_engine(url)
    col_names = {c["name"] for c in sa_inspect(engine).get_columns("runs")}
    engine.dispose()

    assert "queries_completed" in col_names
    assert "queries_total" in col_names


def test_upgrade_head_is_idempotent(tmp_path):
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"

    _run_upgrade(url)
    _run_upgrade(url)  # second call must not raise


# ---------------------------------------------------------------------------
# Startup wiring: on_startup runs migrations, not just create_all
# ---------------------------------------------------------------------------

def test_on_startup_applies_migrations(tmp_path, monkeypatch):
    db_path = tmp_path / "startup.db"
    url = f"sqlite:///{db_path}"

    # Point settings and the database engine at the temp DB
    monkeypatch.setenv("DATABASE_URL", url)

    import importlib
    import app.config as cfg_mod
    import app.database as db_mod
    import app.api.main as main_mod

    # Reload modules so they pick up the patched env var
    importlib.reload(cfg_mod)
    importlib.reload(db_mod)
    importlib.reload(main_mod)

    main_mod.on_startup()

    engine = create_engine(url)
    tables = sa_inspect(engine).get_table_names()
    engine.dispose()

    assert "runs" in tables
    assert "alembic_version" in tables  # proves Alembic ran, not create_all
