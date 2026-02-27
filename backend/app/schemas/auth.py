from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TOTPSetupResponse(BaseModel):
    qr_code_uri: str
    secret: str


class TOTPVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    secret: str | None = None


class ResetPasswordRequest(BaseModel):
    username: str
    otp_code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=6)


class FirstLoginRequest(BaseModel):
    invite_token: str
    email: str | None = None
    password: str = Field(..., min_length=6)
    password_confirm: str


class InviteTokenResponse(BaseModel):
    invite_token: str


class InviteValidationResponse(BaseModel):
    valid: bool
    has_email: bool = False
    email: str | None = None
    full_name: str | None = None
