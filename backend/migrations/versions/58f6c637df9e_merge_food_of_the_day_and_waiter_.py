"""Merge food of the day and waiter schedule migrations

Revision ID: 58f6c637df9e
Revises: c007300d17f0, c2dcaac28f4f
Create Date: 2026-11-01 17:46:21.082688

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '58f6c637df9e'
down_revision = ('c007300d17f0', 'c2dcaac28f4f')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
