from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://attend:attend_secret@db:5432/attendtrack"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 15

    LATE_THRESHOLD_TIME: str = "09:00"
    OVERTIME_THRESHOLD_TIME: str = "18:00"
    LATE_YELLOW_MINUTES: int = 15

    FUZZY_MATCH_THRESHOLD: int = 90

    # Для тестирования: при True логин выдаёт access_token сразу, без 2FA (не использовать в проде)
    DISABLE_2FA_FOR_TESTING: bool = False

    # Производственный календарь РФ: isdayoff.ru (переносы и праздники)
    PRODUCTION_CALENDAR_API_ENABLED: bool = True
    PRODUCTION_CALENDAR_API_URL: str = "https://isdayoff.ru/api/getdata"
    PRODUCTION_CALENDAR_API_TIMEOUT_SEC: float = 10.0


settings = Settings()
