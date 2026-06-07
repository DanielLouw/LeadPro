from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import leads, runs, settings as settings_routes
from app.config import settings

app = FastAPI(title="LeadPro API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router)
app.include_router(leads.router)
app.include_router(settings_routes.router)

_BACKEND_DIR = Path(__file__).parent.parent.parent


@app.on_event("startup")
def on_startup() -> None:
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import text

    from app.database import engine as _engine

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(cfg, "head")

    # Seed the single settings row if absent
    with _engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM settings")).scalar()
        if count == 0:
            conn.execute(
                text(
                    "INSERT INTO settings (google_places_monthly_budget_usd, apify_monthly_budget_usd) "
                    "VALUES (200.0, 5.0)"
                )
            )
            conn.commit()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
