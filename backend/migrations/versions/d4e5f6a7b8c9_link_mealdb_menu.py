"""Map MealDB recipes to restaurant menu records when ordered.
Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from alembic import op
import sqlalchemy as sa
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('mealdb_menu_links',
        sa.Column('mealdb_id', sa.String(20), primary_key=True),
        sa.Column('menu_item_id', sa.Integer(), sa.ForeignKey('menu_items.id'), nullable=False),
        sa.UniqueConstraint('menu_item_id', name='uq_mealdb_menu_links_menu_item_id'))

def downgrade():
    # No restaurant products or historical orders are removed.
    op.drop_table('mealdb_menu_links')
