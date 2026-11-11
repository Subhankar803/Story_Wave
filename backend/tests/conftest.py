"""Fixtures: test DB, client, auth headers."""
import os
import sys
from pathlib import Path
from typing import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend is on sys.path
backend_path = Path(__file__).resolve().parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.api.deps import get_db
from app.core.security import create_access_token, get_password_hash
from app.db.base import Base
from app.main import app
from app.models.story import Story
from app.models.user import User

# In-memory SQLite for testing
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db() -> Generator[Session, None, None]:
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(db: Session) -> User:
    user = User(
        email="author@example.com",
        password_hash=get_password_hash("password123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token(subject=test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def second_user(db: Session) -> User:
    user = User(
        email="second_author@example.com",
        password_hash=get_password_hash("password123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def second_auth_headers(second_user: User) -> dict[str, str]:
    token = create_access_token(subject=second_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def test_story(db: Session, test_user: User) -> Story:
    story = Story(
        title="Chronicles of the Lantern Spirits",
        user_id=test_user.id,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return story
