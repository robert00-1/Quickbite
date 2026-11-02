"""Order idempotency and durable WhatsApp order events.
Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""
from alembic import op
import sqlalchemy as sa
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('orders') as batch:
        batch.add_column(sa.Column('idempotency_key', sa.String(64), nullable=True))
        batch.add_column(sa.Column('request_fingerprint', sa.String(64), nullable=True))
        batch.create_unique_constraint('uq_orders_idempotency_key', ['idempotency_key'])
    op.create_table('order_notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('event', sa.String(32), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('provider_id', sa.String(200), nullable=True, unique=True),
        sa.Column('error_code', sa.String(80), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('order_id', 'event', name='uq_order_notifications_event'))

def downgrade():
    # Explicit downgrade removes new feature data; use only on disposable test DBs.
    op.drop_table('order_notifications')
    with op.batch_alter_table('orders') as batch:
        batch.drop_constraint('uq_orders_idempotency_key', type_='unique')
        batch.drop_column('request_fingerprint')
        batch.drop_column('idempotency_key')
