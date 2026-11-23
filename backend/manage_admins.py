"""Manage local admin accounts.

Run from the backend folder:
    .venv\\Scripts\\python -m manage_admins add <username> --name "Full Name" --role reviewer
    .venv\\Scripts\\python -m manage_admins list
    .venv\\Scripts\\python -m manage_admins remove <username>

Roles: viewer, editor (submit drafts), reviewer (publish or return), admin (everything,
plus approving source domains and unpublishing). Passwords are typed privately and stored
only as a salted scrypt hash in the accounts file (git-ignored).
"""

import argparse
import getpass
import sys

from app import auth


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Manage SchemeSaathi admin accounts")
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="create an account")
    add.add_argument("username")
    add.add_argument("--name", required=True, help="display name, e.g. 'Aishwarya A'")
    add.add_argument("--role", required=True, choices=auth.ROLES)
    sub.add_parser("list", help="list accounts")
    rm = sub.add_parser("remove", help="delete an account")
    rm.add_argument("username")
    args = ap.parse_args(argv)

    if args.cmd == "add":
        password = getpass.getpass(f"Password for {args.username} (min {auth.MIN_PASSWORD_LENGTH} chars): ")
        if password != getpass.getpass("Repeat password: "):
            print("Passwords do not match.")
            return 1
        try:
            auth.add_user(args.username, args.name, args.role, password)
        except ValueError as exc:
            print(f"Error: {exc}")
            return 1
        print(f"Created {args.username} ({args.role}) in {auth.users_file()}")
    elif args.cmd == "list":
        for u in auth.list_users():
            print(f"{u.username:20} {u.role:9} {u.display_name}")
    elif args.cmd == "remove":
        print("Removed." if auth.remove_user(args.username) else "No such user.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
