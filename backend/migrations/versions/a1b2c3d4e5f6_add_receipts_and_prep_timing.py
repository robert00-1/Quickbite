"""Add receipts table and timing fields to menu and orders

Revision ID: a1b2c3d4e5f6
Revises: 58f6c637df9e
Create Date: 2026-11-02 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '58f6c637df9e'
branch_labels = None
depends_on = None


def upgrade():
    # Update menu_items with prep and serving times
    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('preparation_time', sa.Integer(), server_default='15', nullable=False))
        batch_op.add_column(sa.Column('serving_time', sa.Integer(), server_default='5', nullable=False))

    # Update orders table_number type from integer to string
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.alter_column('table_number',
               existing_type=sa.INTEGER(),
               type_=sa.String(length=10),
               existing_nullable=False, postgresql_using='table_number::text')

    # Update order_items with prep and serving times
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('preparation_time', sa.Integer(), server_default='15', nullable=False))
        batch_op.add_column(sa.Column('serving_time', sa.Integer(), server_default='5', nullable=False))

    # Create receipts table
    op.create_table('receipts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('receipt_token', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('order_id'),
        sa.UniqueConstraint('receipt_token')
    )


def downgrade():
    op.drop_table('receipts')

    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.drop_column('serving_time')
        batch_op.drop_column('preparation_time')

    # Keep string table identifiers on downgrade to preserve A1/B2 records.

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_column('serving_time')
        batch_op.drop_column('preparation_time')

