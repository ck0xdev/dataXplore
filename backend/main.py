from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict
import os
import uvicorn
import traceback

from ml_models import (
    get_eda_stats,
    predict_population,
    predict_size_category,
    train_models,
)

app = FastAPI(
    title="DataXplore API",
    description="Advanced backend for city data analysis and ML population prediction.",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── SCHEMAS ─────────────────────────────────────────────────────
class PredictionResponse(BaseModel):
    area: float
    result: Any
    unit: str = ""


class EDAStatsResponse(BaseModel):
    summary: Dict[str, Any]
    charts: Dict[str, Any]
    model_performance: Dict[str, Any]


# ─── LIFECYCLE ───────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    train_models()
    print("✓ DataXplore AI services ready.\n")


# ─── API ROUTES ──────────────────────────────────────────────────
@app.get("/api/eda_stats", response_model=EDAStatsResponse)
def get_stats():
    try:
        return get_eda_stats()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/predict/population", response_model=PredictionResponse)
def predict_pop(area: float = Query(..., gt=0, description="City land area in sq km")):
    try:
        pop = predict_population(area)
        return {"area": area, "result": round(pop, 2), "unit": "People (Est.)"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/predict/size", response_model=PredictionResponse)
def predict_size(area: float = Query(..., gt=0, description="City land area in sq km")):
    try:
        size = predict_size_category(area)
        return {"area": area, "result": size, "unit": "Category"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── HEALTH ──────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.1.0"}


# ─── STATIC FRONTEND ─────────────────────────────────────────────
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)