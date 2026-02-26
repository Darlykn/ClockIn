"""
Seed script: creates a default admin user only.

Usage (inside container):
    python -m app.db.seed
"""

import asyncio
import uuid

import bcrypt
from sqlalchemy import select

from app.db.models import User
from app.db.session import AsyncSessionLocal


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


async def create_admin(session) -> User:
    result = await session.execute(select(User).where(User.username == "admin"))
    admin = result.scalar_one_or_none()
    if admin:
        # Ensure admin does not have 2FA pre-configured so that
        # the first login after seeding always goes through QR-setup.
        if admin.totp_secret is not None:
            admin.totp_secret = None
            await session.flush()
            print("Admin user already exists, cleared totp_secret for fresh 2FA setup.")
        else:
            print("Admin user already exists, 2FA not configured, skipping.")
        return admin

    admin = User(
        id=uuid.uuid4(),
        username="admin",
        password_hash=hash_password("admin123"),
        role="admin",
        full_name="Администратор Системы",
        is_active=True,
    )
    session.add(admin)
    await session.flush()
    print(f"Created admin user: id={admin.id}")
    return admin


async def main():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await create_admin(session)
            print("Seed complete. Admin user only.")


if __name__ == "__main__":
    asyncio.run(main())
