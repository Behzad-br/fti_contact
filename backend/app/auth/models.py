from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.database import Base


def _id() -> str:
    return str(uuid.uuid4())


class Branch(Base):
    __tablename__ = "auth_branches"

    id = Column(String, primary_key=True, default=_id)
    name = Column(String, nullable=False)
    city = Column(String, default="")
    image_url = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Batch(Base):
    __tablename__ = "auth_batches"

    id = Column(String, primary_key=True, default=_id)
    name = Column(String, nullable=False, index=True)
    schedule = Column(String, default="")
    subjects = Column(String, default="")
    branch_id = Column(String, index=True, default="")
    teacher_id = Column(String, index=True, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "auth_users"

    id = Column(String, primary_key=True, default=_id)
    role = Column(String, nullable=False, index=True)  # super_admin | branch_admin | teacher | student
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, default="")
    branch_id = Column(String, index=True, default="")
    batch = Column(String, default="")  # student primary batch label
    batches = Column(String, default="")  # teacher assigned batch names CSV
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
