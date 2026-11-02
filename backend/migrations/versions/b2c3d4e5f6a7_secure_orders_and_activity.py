"""Secure order ownership, receipt notifications and waiter activity.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    duplicate = op.get_bind().execute(sa.text("SELECT waiter_id FROM shifts WHERE ended_at IS NULL GROUP BY waiter_id HAVING COUNT(*) > 1")).first()
    if duplicate:
        raise RuntimeError("Multiple active shifts exist for a staff account. Reconcile their actual end timestamps before upgrading; no records were removed.")
    inspector = sa.inspect(op.get_bind())
    # Early create_all databases omitted this historical foreign key.
    if not inspector.get_foreign_keys('shifts'):
        orphan = op.get_bind().execute(sa.text("SELECT shifts.id FROM shifts LEFT JOIN staff_users ON shifts.waiter_id=staff_users.id WHERE staff_users.id IS NULL")).first()
        if orphan:
            raise RuntimeError("Orphan shift records need an authorized staff mapping before upgrade.")
        with op.batch_alter_table('shifts') as batch:
            batch.create_foreign_key('fk_shifts_staff_user', 'staff_users', ['waiter_id'], ['id'], ondelete='CASCADE')
    receipt_fks = inspector.get_foreign_keys('receipts')
    if receipt_fks and receipt_fks[0].get('options', {}).get('ondelete') != 'CASCADE':
        convention = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
        with op.batch_alter_table('receipts', naming_convention=convention) as batch:
            batch.drop_constraint(receipt_fks[0]['name'] or 'fk_receipts_order_id_orders', type_='foreignkey')
            batch.create_foreign_key('fk_receipts_order_id_orders', 'orders', ['order_id'], ['id'], ondelete='CASCADE')
    op.create_table('payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('checkout_request_id', sa.String(100), unique=True, nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_payments_order_id', 'payments', ['order_id'])
    with op.batch_alter_table('orders') as batch:
        batch.add_column(sa.Column('customer_id', sa.String(64), nullable=True))
        batch.add_column(sa.Column('served_at', sa.DateTime(timezone=True), nullable=True))
        batch.create_index('ix_orders_customer_id', ['customer_id'])
    with op.batch_alter_table('waiter_profiles') as batch:
        batch.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_waiter_profiles_user_id', 'staff_users', ['user_id'], ['id'])
        batch.create_unique_constraint('uq_waiter_profiles_user_id', ['user_id'])
    # Link only unambiguous exact matches, preserving unmatched historical profiles.
    op.execute("""UPDATE waiter_profiles SET user_id =
        (SELECT MIN(id) FROM staff_users WHERE role='waiter' AND staff_users.full_name=waiter_profiles.full_name)
        WHERE (SELECT COUNT(*) FROM staff_users WHERE role='waiter' AND staff_users.full_name=waiter_profiles.full_name)=1""")
    with op.batch_alter_table('receipts') as batch:
        batch.add_column(sa.Column('notification_status', sa.String(20), server_default='pending', nullable=False))
        batch.add_column(sa.Column('notification_error', sa.String(200), nullable=True))
        batch.add_column(sa.Column('notification_provider_id', sa.String(200), nullable=True))
    op.create_table('complaints',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('customer_name', sa.String(120), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('table_number', sa.String(10), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_complaints_order_id', 'complaints', ['order_id'])
    # Refuse unsafe changes rather than deleting existing duplicate shifts or orphan records.
    op.create_index('uq_shifts_active_waiter', 'shifts', ['waiter_id'], unique=True,
                    sqlite_where=sa.text('ended_at IS NULL'), postgresql_where=sa.text('ended_at IS NULL'))


def downgrade():
    op.drop_table("payments")
    op.drop_index('uq_shifts_active_waiter', table_name='shifts')
    op.drop_table('complaints')
    with op.batch_alter_table('receipts') as batch:
        for name in ['notification_provider_id', 'notification_error', 'notification_status']:
            batch.drop_column(name)
    with op.batch_alter_table('waiter_profiles') as batch:
        batch.drop_constraint('fk_waiter_profiles_user_id', type_='foreignkey')
        batch.drop_constraint('uq_waiter_profiles_user_id', type_='unique')
        batch.drop_column('user_id')
    with op.batch_alter_table('orders') as batch:
        batch.drop_index('ix_orders_customer_id')
        batch.drop_column('served_at')
        batch.drop_column('customer_id')
