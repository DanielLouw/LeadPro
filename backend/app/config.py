from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GOOGLE_PLACES_API_KEY: str = ""
    PAGESPEED_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./leadpro.db"
    APIFY_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

# ---------------------------------------------------------------------------
# Google Places Text Search pricing constants (issue #0006)
# ---------------------------------------------------------------------------
# Current pricing as of 2024: $32 per 1 000 Text Search requests.
# Source: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
PLACES_COST_PER_1000_REQUESTS: float = 32.0

# The Places Text Search API returns up to 20 results per page (one request).
PLACES_RESULTS_PER_REQUEST: int = 20

# Default cap on total raw results fetched per run (reduced for Apify cost control).
DEFAULT_MAX_RESULTS_PER_RUN: int = 10

# ---------------------------------------------------------------------------
# Apify constants (issues #0019, #0020)
# ---------------------------------------------------------------------------
APIFY_API_BASE_URL: str = "https://api.apify.com/v2"

# Apify Google Maps Scraper: free-plan rate per lead result.
APIFY_GOOGLE_MAPS_COST_PER_LEAD: float = 0.004

# Apify Facebook Pages Scraper: free-plan rate per lead result.
APIFY_FACEBOOK_PAGES_COST_PER_LEAD: float = 0.010
