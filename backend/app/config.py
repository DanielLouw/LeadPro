from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GOOGLE_PLACES_API_KEY: str = ""
    PAGESPEED_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./leadpro.db"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
