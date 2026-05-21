"""Self-check: is the DB ready for Google OAuth signups?

Run inside the app container — lets you verify the migration half of the fix
WITHOUT depending on the Google Cloud Console origin step:

    docker compose exec app python scripts/check_oauth_ready.py

Exit code 0 = ready. Non-zero = what's missing is printed explicitly.
Read-only: runs SELECTs against information_schema, changes nothing.
"""
import asyncio
import sys

from sqlalchemy import text
from database import engine


REQUIRED = {
    # column          : expected is_nullable
    "google_sub": "YES",
    "password_hash": "YES",
    "phone": "YES",
}


async def main() -> int:
    problems: list[str] = []

    async with engine.connect() as conn:
        # Alembic head applied?
        try:
            row = (await conn.execute(text("SELECT version_num FROM alembic_version"))).first()
            current = row[0] if row else None
            print(f"alembic_version = {current}")
            if current != "d4e3f2a1b0c9":
                problems.append(
                    f"alembic head is {current!r}, expected 'd4e3f2a1b0c9'. "
                    "Run: alembic upgrade head"
                )
        except Exception as exc:
            problems.append(f"Cannot read alembic_version: {exc}")

        # users columns present + nullable as expected
        rows = (
            await conn.execute(
                text(
                    "SELECT column_name, is_nullable FROM information_schema.columns "
                    "WHERE table_name = 'users'"
                )
            )
        ).all()
        cols = {name: nullable for name, nullable in rows}

        for col, want in REQUIRED.items():
            if col not in cols:
                problems.append(f"users.{col} MISSING — migration c3d2e1f0a9b8 not applied")
            elif cols[col] != want:
                problems.append(
                    f"users.{col} is_nullable={cols[col]!r}, expected {want!r} "
                    "— migration c3d2e1f0a9b8 not applied"
                )
            else:
                print(f"OK  users.{col} (nullable={cols[col]})")

    print("-" * 50)
    if problems:
        print("NOT READY for Google signups:")
        for p in problems:
            print(f"  ✗ {p}")
        return 1

    print("READY — DB accepts Google OAuth signups. If the button still fails,")
    print("the remaining blocker is the Google Cloud Console origin allowlist")
    print("(http://localhost:3000), which is a console setting, not the DB.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
