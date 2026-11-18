"""token_version for participants and staff

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18 23:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ('participants', 'staff'):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    for table in ('participants', 'staff'):
        with op.batch_alter_table(table) as batch:
            batch.drop_column('token_version')
