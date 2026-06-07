"""add_apify_api_key_to_settings

Revision ID: a3f9c1d82b47
Revises: 21d81cdb89a5
Create Date: 2026-06-07 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3f9c1d82b47"
down_revision: Union[str, Sequence[str], None] = "21d81cdb89a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("apify_api_key", sa.String(512), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("settings", "apify_api_key")
