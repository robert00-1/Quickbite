"""Create an initial staff account after running migrations."""
import argparse
import getpass
import os
from werkzeug.security import generate_password_hash
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.waiter_profile import WaiterProfile


def seed_staff(username, password, full_name, role="manager"):
    if len(password) < 8 or role not in ("manager", "waiter"):
        raise ValueError("Use a password of at least eight characters and a valid staff role")
    with create_app().app_context():
        if User.query.filter_by(username=username.lower()).first():
            print("Account already exists; no changes made.")
            return
        user = User(username=username.lower(), full_name=full_name, password_hash=generate_password_hash(password), role=role)
        db.session.add(user); db.session.flush()
        if role == "waiter":
            profile = WaiterProfile.query.filter_by(full_name=full_name, user_id=None).first()
            if profile: profile.user_id=user.id
            else: db.session.add(WaiterProfile(full_name=full_name, user_id=user.id))
        db.session.commit()
        print("Staff account created.")

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("username")
    parser.add_argument("full_name")
    parser.add_argument("--role", choices=["manager", "waiter"], default="manager")
    args=parser.parse_args()
    seed_staff(args.username, os.getenv("INITIAL_STAFF_PASSWORD") or getpass.getpass("Staff password: "), args.full_name, args.role)
