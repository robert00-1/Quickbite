"""Validate/adopt an unversioned SQLite database without resetting its data.

Default: inspect only. --apply creates a backup, stamps a verified historical
baseline, then runs additive migrations. Unsupported schemas are rejected.
"""
import argparse
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from flask_migrate import upgrade, stamp
from sqlalchemy import inspect
from sqlalchemy.engine import make_url
from app import create_app
from app.config import Config
from app.extensions import db

MIGRATIONS = str(Path(__file__).parent / 'migrations')
BASELINE = 'a1b2c3d4e5f6'


def adopt(database_url, apply=False):
    url=make_url(database_url)
    if url.get_backend_name() != 'sqlite' or not url.database or url.database == ':memory:':
        raise RuntimeError('Legacy adoption supports existing SQLite files only; versioned PostgreSQL uses flask db upgrade.')
    source=Path(url.database).resolve()
    if not source.is_file():
        raise RuntimeError('The database file does not exist.')
    app=create_app({'SQLALCHEMY_DATABASE_URI':database_url})
    with app.app_context():
        actual=inspect(db.engine)
        tables=set(actual.get_table_names())
        if 'alembic_version' in tables:
            raise RuntimeError('This database is already versioned. Use flask db upgrade.')
        actual_columns={t:{c['name']:c for c in actual.get_columns(t)} for t in tables}
        for table in ['orders','order_items','staff_sessions','weekly_shifts']:
            if table in tables and not actual.get_foreign_keys(table):
                raise RuntimeError(f'Missing historical foreign keys in {table}; manual schema reconciliation is required.')
    with tempfile.TemporaryDirectory(prefix='quickbite-baseline-') as temp:
        ref=create_app({'SQLALCHEMY_DATABASE_URI':f'sqlite:///{temp}/reference.sqlite'})
        with ref.app_context():
            upgrade(directory=MIGRATIONS,revision=BASELINE)
            expected=inspect(db.engine)
            expected_tables=set(expected.get_table_names())-{'alembic_version'}
            if tables != expected_tables:
                raise RuntimeError('Schema does not match the supported legacy baseline (table mismatch). No changes made.')
            for table in expected_tables:
                columns={c['name']:c for c in expected.get_columns(table)}
                if columns.keys() != actual_columns[table].keys():
                    raise RuntimeError(f'Column mismatch in {table}. No changes made.')
                for name,column in columns.items():
                    current=actual_columns[table][name]
                    if str(column['type']) != str(current['type']) or column['nullable'] != current['nullable']:
                        raise RuntimeError(f'Column type/nullability mismatch in {table}.{name}. No changes made.')
            db.engine.dispose()
    print('Supported legacy baseline verified. Existing rows will be retained.')
    if not apply:
        print('Run again with --apply to back up and migrate this database.')
        return
    backup_dir=source.parent/'backups'
    backup_dir.mkdir(exist_ok=True)
    backup=backup_dir/(source.name+'.backup-'+datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
    with sqlite3.connect(source) as src, sqlite3.connect(backup) as target:
        src.backup(target)
    print('SQLite backup created in the backups directory beside the source database.')
    with app.app_context():
        stamp(directory=MIGRATIONS, revision=BASELINE)
        upgrade(directory=MIGRATIONS)
        db.engine.dispose()
    print('Migration completed. Run flask db check to verify model parity.')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database-url', default=Config.SQLALCHEMY_DATABASE_URI)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    adopt(args.database_url,args.apply)
