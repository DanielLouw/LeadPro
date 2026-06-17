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


# ---------------------------------------------------------------------------
# Issue #0017: Apify lead sources schema foundation
# ---------------------------------------------------------------------------

def test_leads_has_external_id_not_place_id(tmp_path):
    """leads.external_id exists; leads.place_id does not."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    col_names = {c["name"] for c in sa_inspect(engine).get_columns("leads")}
    engine.dispose()

    assert "external_id" in col_names
    assert "place_id" not in col_names


def test_runs_has_source_column(tmp_path):
    """runs.source column exists after migration."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    col_names = {c["name"] for c in sa_inspect(engine).get_columns("runs")}
    engine.dispose()

    assert "source" in col_names


def test_runs_has_apify_columns(tmp_path):
    """runs.apify_run_id and runs.apify_status columns exist."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    col_names = {c["name"] for c in sa_inspect(engine).get_columns("runs")}
    engine.dispose()

    assert "apify_run_id" in col_names
    assert "apify_status" in col_names


def test_runs_has_cost_usd_column(tmp_path):
    """runs.cost_usd column exists after migration."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    col_names = {c["name"] for c in sa_inspect(engine).get_columns("runs")}
    engine.dispose()

    assert "cost_usd" in col_names


def test_settings_table_created(tmp_path):
    """settings table exists after migration."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    tables = sa_inspect(engine).get_table_names()
    engine.dispose()

    assert "settings" in tables


def test_existing_runs_backfilled_with_google_places_source(tmp_path):
    """All pre-existing runs rows get source='google_places' after migration."""
    from sqlalchemy import text

    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"

    # Apply initial schema only (up to just before 0017 migration)
    from alembic.config import Config
    from alembic import command as alembic_cmd

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    alembic_cmd.upgrade(cfg, "98e9f8594685")  # initial schema

    # Insert a run row to simulate pre-existing data
    engine = create_engine(url)
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO runs (created_at, config_yaml, status, total_leads, "
                "queries_completed, queries_total) VALUES "
                "('2026-01-01', 'queries: []', 'completed', 0, 0, 0)"
            )
        )
        conn.commit()
    engine.dispose()

    # Now upgrade to head
    alembic_cmd.upgrade(cfg, "head")

    # Verify all rows have source='google_places'
    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT source FROM runs")).fetchall()
    engine.dispose()

    assert len(rows) == 1
    assert rows[0][0] == "google_places"


def test_settings_table_seeded_on_startup(tmp_path, monkeypatch):
    """on_startup seeds exactly one settings row with default budget values."""
    from sqlalchemy import text

    db_path = tmp_path / "startup_settings.db"
    url = f"sqlite:///{db_path}"

    monkeypatch.setenv("DATABASE_URL", url)

    import importlib
    import app.config as cfg_mod
    import app.database as db_mod
    import app.api.main as main_mod

    importlib.reload(cfg_mod)
    importlib.reload(db_mod)
    importlib.reload(main_mod)

    main_mod.on_startup()

    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM settings")).fetchall()
    engine.dispose()

    assert len(rows) == 1


def test_settings_seed_is_idempotent(tmp_path, monkeypatch):
    """Calling on_startup twice does not create a second settings row."""
    from sqlalchemy import text

    db_path = tmp_path / "idempotent_settings.db"
    url = f"sqlite:///{db_path}"

    monkeypatch.setenv("DATABASE_URL", url)

    import importlib
    import app.config as cfg_mod
    import app.database as db_mod
    import app.api.main as main_mod

    importlib.reload(cfg_mod)
    importlib.reload(db_mod)
    importlib.reload(main_mod)

    main_mod.on_startup()
    main_mod.on_startup()

    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM settings")).fetchall()
    engine.dispose()

    assert len(rows) == 1


# ---------------------------------------------------------------------------
# Issue #15: SearchSlot migration
# ---------------------------------------------------------------------------

def test_upgrade_head_creates_search_slots_table(tmp_path):
    """search_slots table exists after upgrade head."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    tables = sa_inspect(engine).get_table_names()
    engine.dispose()

    assert "search_slots" in tables


def test_search_slots_has_required_columns(tmp_path):
    """search_slots table has all required columns with correct nullability."""
    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    inspector = sa_inspect(engine)
    cols = {c["name"]: c for c in inspector.get_columns("search_slots")}
    engine.dispose()

    # Primary key
    assert "id" in cols

    # Non-nullable identity columns
    for col_name in ("state", "county", "industry", "search_term"):
        assert col_name in cols, f"Missing column: {col_name}"
        assert not cols[col_name]["nullable"], f"{col_name} should be NOT NULL"

    # search_count: non-nullable with DB-level default of 0
    assert "search_count" in cols
    assert not cols["search_count"]["nullable"]

    # last_run_id: nullable FK
    assert "last_run_id" in cols
    assert cols["last_run_id"]["nullable"]


def test_search_slots_unique_constraint_enforced(tmp_path):
    """DB raises IntegrityError on duplicate (state, county, industry, search_term)."""
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO search_slots (state, county, industry, search_term, search_count) "
                "VALUES ('TX', 'Harris', 'plumber', 'plumber Harris TX', 0)"
            )
        )
        conn.commit()

        # Use a savepoint so the IntegrityError doesn't poison the outer connection
        with pytest.raises(IntegrityError):
            with conn.begin_nested():
                conn.execute(
                    text(
                        "INSERT INTO search_slots (state, county, industry, search_term, search_count) "
                        "VALUES ('TX', 'Harris', 'plumber', 'plumber Harris TX', 0)"
                    )
                )
    engine.dispose()


def test_search_slots_search_count_defaults_to_zero(tmp_path):
    """search_count column has a DB-level server default of 0, applied on INSERT."""
    from sqlalchemy import text

    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)

    # Verify server_default is declared in schema metadata
    inspector = sa_inspect(engine)
    cols = {c["name"]: c for c in inspector.get_columns("search_slots")}
    default = cols["search_count"].get("default")
    assert default is not None, "search_count must have a server default"
    assert str(default).strip("'\" ") == "0"

    # Verify the server_default is actually applied at INSERT time
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO search_slots (state, county, industry, search_term) "
                "VALUES ('TX', 'Harris', 'plumber', 'plumber Harris TX')"
            )
        )
        conn.commit()
        count = conn.execute(
            text("SELECT search_count FROM search_slots WHERE state = 'TX'")
        ).scalar()

    engine.dispose()

    assert count == 0


def test_search_slots_last_run_id_fk_on_delete_set_null(tmp_path):
    """Deleting a run sets last_run_id to NULL rather than cascading delete."""
    from sqlalchemy import text

    db_path = tmp_path / "test.db"
    url = f"sqlite:///{db_path}"
    _run_upgrade(url)

    engine = create_engine(url)
    with engine.connect() as conn:
        # SQLite foreign key enforcement must be enabled per connection
        conn.execute(text("PRAGMA foreign_keys = ON"))

        # Insert a run
        conn.execute(
            text(
                "INSERT INTO runs (created_at, config_yaml, status, total_leads, "
                "queries_completed, queries_total, source) VALUES "
                "('2026-01-01', 'queries: []', 'completed', 0, 0, 0, 'google_places')"
            )
        )
        conn.commit()

        run_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()

        # Insert a search slot that references this run
        conn.execute(
            text(
                "INSERT INTO search_slots (state, county, industry, search_term, search_count, last_run_id) "
                "VALUES ('TX', 'Harris', 'plumber', 'plumber Harris TX', 1, :run_id)"
            ),
            {"run_id": run_id},
        )
        conn.commit()

        # Delete the run
        conn.execute(text("DELETE FROM runs WHERE id = :run_id"), {"run_id": run_id})
        conn.commit()

        # last_run_id should now be NULL, not a dangling reference
        last_run_id = conn.execute(
            text("SELECT last_run_id FROM search_slots WHERE state = 'TX'")
        ).scalar()

    engine.dispose()

    assert last_run_id is None
