"""Tests for authentication endpoints."""
from fastapi.testclient import TestClient


def test_register_and_login(client: TestClient):
    # Register
    reg_res = client.post(
        "/auth/register",
        json={"email": "writer@example.com", "password": "supersecretpassword"},
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()
    assert user_data["email"] == "writer@example.com"
    assert "id" in user_data

    # Duplicate email error
    dup_res = client.post(
        "/auth/register",
        json={"email": "writer@example.com", "password": "supersecretpassword"},
    )
    assert dup_res.status_code == 400

    # Login
    login_res = client.post(
        "/auth/login",
        json={"email": "writer@example.com", "password": "supersecretpassword"},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

    # Invalid login
    bad_login = client.post(
        "/auth/login",
        json={"email": "writer@example.com", "password": "wrongpassword"},
    )
    assert bad_login.status_code == 401

    # Two-step verification (OTP: 123456)
    login_otp_ok = client.post(
        "/auth/login",
        json={"email": "writer@example.com", "password": "supersecretpassword", "otp": "123456"},
    )
    assert login_otp_ok.status_code == 200

    login_otp_bad = client.post(
        "/auth/login",
        json={"email": "writer@example.com", "password": "supersecretpassword", "otp": "000000"},
    )
    assert login_otp_bad.status_code == 400

    # Standalone verify-otp endpoint
    otp_ok = client.post("/auth/verify-otp", json={"otp": "123456"})
    assert otp_ok.status_code == 200
    assert otp_ok.json()["valid"] is True

    otp_bad = client.post("/auth/verify-otp", json={"otp": "999999"})
    assert otp_bad.status_code == 400

