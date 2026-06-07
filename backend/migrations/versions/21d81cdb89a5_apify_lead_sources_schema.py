"""apify_lead_sources_schema

Revision ID: 21d81cdb89a5
Revises: 98e9f8594685
Create Date: 2026-06-07 13:30:34.250994

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "21d81cdb89a5"
down_revision: Union[str, Sequence[str], None] = "98e9f8594685"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # leads: rename place_id → external_id
    # SQLite does not support ALTER COLUMN RENAME directly, so we use
    # batch_alter_table which rewrites the table via a temp-table copy.
    # -------------------------------------------------------------------------
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.alter_column(
            "place_id",
            new_column_name="external_id",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )
        # Drop old unique constraint and recreate with new column name
        batch_op.drop_constraint("leads_run_place_unique", type_="unique")
        batch_op.create_unique_constraint(
            "leads_run_external_unique", ["run_id", "external_id"]
        )

    # -------------------------------------------------------------------------
    # runs: add source (NOT NULL, backfilled), apify_run_id, apify_status,
    # cost_usd columns
    # -------------------------------------------------------------------------
    # Add source as nullable first so the backfill can proceed, then enforce NOT NULL
    op.add_column(
        "runs",
        sa.Column("source", sa.String(length=50), nullable=True),
    )
    # Backfill all existing rows
    op.execute("UPDATE runs SET source = 'google_places'")

    # Remaining new columns (all nullable)
    op.add_column(
        "runs",
        sa.Column("apify_run_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("apify_status", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("cost_usd", sa.Float(), nullable=True),
    )

    # Make source NOT NULL and add the check constraint via batch_alter_table
    with op.batch_alter_table("runs", schema=None) as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.String(length=50),
            nullable=False,
            server_default="google_places",
        )
        batch_op.create_check_constraint(
            "runs_source_check",
            "source IN ('google_places', 'apify_google_maps', 'apify_facebook_pages')",
        )

    # -------------------------------------------------------------------------
    # settings: single-row config table
    # -------------------------------------------------------------------------
    op.create_table(
        "settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "google_places_monthly_budget_usd",
            sa.Float(),
            nullable=False,
            server_default="200.0",
        ),
        sa.Column(
            "apify_monthly_budget_usd",
            sa.Float(),
            nullable=False,
            server_default="5.0",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("settings")

    with op.batch_alter_table("runs", schema=None) as batch_op:
        batch_op.drop_constraint("runs_source_check", type_="check")
        batch_op.drop_column("cost_usd")
        batch_op.drop_column("apify_status")
        batch_op.drop_column("apify_run_id")
        batch_op.drop_column("source")

    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.drop_constraint("leads_run_external_unique", type_="unique")
        batch_op.alter_column(
            "external_id",
            new_column_name="place_id",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )
        batch_op.create_unique_constraint(
            "leads_run_place_unique", ["run_id", "place_id"]
        )
