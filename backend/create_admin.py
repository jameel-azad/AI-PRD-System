"""
One-time script to create an admin user.
Run from the backend/ directory:
    python create_admin.py
"""
import asyncio
import sys
import os

# Load .env from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole


async def main():
    print("=== Xccelera Admin Account Setup ===\n")

    email = input("Admin email: ").strip()
    name  = input("Admin name:  ").strip()
    pwd   = input("Password (min 8 chars): ").strip()

    if not email or not name:
        print("Email and name are required.")
        sys.exit(1)
    if len(pwd) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            print(f"\nA user with email '{email}' already exists (role: {existing.role.value}).")
            sys.exit(1)

        user = User(email=email, name=name, role=UserRole.admin, hashed_pw=hash_password(pwd))
        db.add(user)
        await db.commit()
        await db.refresh(user)

    print(f"\nAdmin account created successfully.")
    print(f"  Email : {user.email}")
    print(f"  Name  : {user.name}")
    print(f"  Role  : {user.role.value}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
