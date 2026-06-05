from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import leads, runs
from app.database import init_db

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


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
