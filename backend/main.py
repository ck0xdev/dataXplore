from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ml_models import get_eda_stats, predict_population, predict_size_category, train_models
import os

app = FastAPI(title="DataXplore API")

# Allow CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional: Mount frontend directory if it exists
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/app", StaticFiles(directory=frontend_path, html=True), name="frontend")

@app.on_event("startup")
def startup_event():
    # Train models on startup so they are ready
    train_models()
    print("Models trained on startup.")

@app.get("/api/eda_stats")
def get_stats():
    """Returns the exploratory data analysis statistics containing info for charts."""
    try:
        return get_eda_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict/population")
def predict_pop(area: float):
    """Predict population based on Area utilizing RandomForestRegressor"""
    try:
        pop = predict_population(area)
        return {"predicted_population": round(pop, 2)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict/size")
def predict_size(area: float):
    """Predict size category (Classification) utilizing RandomForestClassifier"""
    try:
        size = predict_size_category(area)
        return {"predicted_size_category": size}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
