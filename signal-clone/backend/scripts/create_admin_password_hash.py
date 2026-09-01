"""Create a password hash for ADMIN_PASSWORD_HASH without storing the password."""

from getpass import getpass
from werkzeug.security import generate_password_hash


if __name__ == '__main__':
    password = getpass('Choose the admin password: ')
    confirmation = getpass('Confirm the admin password: ')
    if not password or password != confirmation:
        raise SystemExit('Passwords did not match.')
    print(generate_password_hash(password))
