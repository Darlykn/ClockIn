"""
Clear 2FA for admin user so next login shows QR setup.

Usage (in container or same env as backend):
    python -m app.db.clear_admin_2fa
"""

import asyncio
from sqlalchemy import select

from app.db.models import User
from app.db.session import AsyncSessionLocal


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        if admin is None:
            print("Admin user not found.")
            return
        if admin.totp_secret is None:
            print("Admin already has no 2FA configured.")
            return
        admin.totp_secret = None
        await session.commit()
        print("Admin 2FA cleared. Next login will show QR setup.")


if __name__ == "__main__":
    asyncio.run(main())
