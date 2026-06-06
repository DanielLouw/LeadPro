from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import leads, runs
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

_BACKEND_DIR = Path(__file__).parent.parent.parent


@app.on_event("startup")
def on_startup() -> None:
    from alembic.config import Config
    from alembic import command

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(cfg, "head")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
