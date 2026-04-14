import pandas as pd
import numpy as np
import os
import joblib
import warnings
from functools import lru_cache
from sklearn.model_selection import train_test_split, cross_val_score, RandomizedSearchCV
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score
from sklearn.preprocessing import StandardScaler, FunctionTransformer
from sklearn.pipeline import Pipeline
from scipy.stats import randint, uniform
from typing import Dict, Any

warnings.filterwarnings("ignore")

# ─── CONFIGURATION ───────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "Dataset", "Top 100 Worlds Largest Cities.csv")
MODEL_DIR = os.path.join(BASE_DIR, "backend", "saved_models")
os.makedirs(MODEL_DIR, exist_ok=True)

_model_stats: Dict[str, Any] = {}
_clf_thresholds: Dict[str, float] = {}


# ─── DATA LOADING ────────────────────────────────────────────────
@lru_cache(maxsize=1)
def load_and_clean_data() -> pd.DataFrame:
    """Load CSV, clean numerics, engineer features, classify city tiers."""
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Dataset missing: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    # Normalise column names for robustness
    rename_map = {}
    for col in df.columns:
        low = col.lower().strip()
        if "population" in low and "pop" in low and "density" not in low:
            rename_map[col] = "Population (Est.)"
        elif "area" in low:
            rename_map[col] = "Area (sq km)"
        elif low in ("city", "cities", "name"):
            rename_map[col] = "City"
        elif "country" in low or "nation" in low:
            rename_map[col] = "Country"
    df.rename(columns=rename_map, inplace=True)

    # Clean numeric strings → float
    for col in ["Population (Est.)", "Area (sq km)"]:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(",", "", regex=False)
                .str.strip()
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Drop rows missing critical fields
    df = df.dropna(subset=["Population (Est.)", "Area (sq km)"])
    df = df[df["Area (sq km)"] > 0]  # guard against zero-area
    df = df.reset_index(drop=True)

    # Derived feature
    df["Density (pop/sq km)"] = df["Population (Est.)"] / df["Area (sq km)"]

    # ── Quantile-based city classification ──
    q75 = df["Population (Est.)"].quantile(0.75)
    q25 = df["Population (Est.)"].quantile(0.25)
    _clf_thresholds["mega"] = float(q75)
    _clf_thresholds["large"] = float(q25)

    def _classify(pop: float) -> str:
        if pop >= q75:
            return "Mega City"
        if pop >= q25:
            return "Large City"
        return "Medium City"

    df["Size Category"] = df["Population (Est.)"].apply(_classify)
    return df


# ─── FEATURE ENGINEERING ─────────────────────────────────────────
def _expand_features(X_df) -> np.ndarray:
    """From a single 'Area' column produce 4 engineered features:
    raw, log1p, sqrt, reciprocal — captures linear + non-linear patterns."""
    a = X_df.iloc[:, 0:1].values.astype(np.float64)
    log_a = np.log1p(a)
    sqrt_a = np.sqrt(a)
    inv_a = 1.0 / (a + 1.0)
    return np.hstack([a, log_a, sqrt_a, inv_a])


# ─── MODEL TRAINING ──────────────────────────────────────────────
def train_models() -> None:
    """Train regression + classification with hyper-parameter search
    and cross-validation. Persists best models to disk."""
    global _model_stats

    df = load_and_clean_data()
    reg_path = os.path.join(MODEL_DIR, "rf_regressor.pkl")
    clf_path = os.path.join(MODEL_DIR, "rf_classifier.pkl")

    X = df[["Area (sq km)"]].copy()

    # ═══════════════════════════════════════════════════════════════
    #  REGRESSION  — predict Population from Area (log-space target)
    # ═══════════════════════════════════════════════════════════════
    y = df["Population (Est.)"]
    y_log = np.log1p(y)  # log-normal → Gaussian in log-space

    reg_pipe = Pipeline([
        ("feat", FunctionTransformer(_expand_features, validate=False)),
        ("scale", StandardScaler()),
        ("model", GradientBoostingRegressor(random_state=42)),
    ])

    reg_search = RandomizedSearchCV(
        reg_pipe,
        {
            "model__n_estimators": randint(200, 600),
            "model__max_depth": randint(2, 5),
            "model__learning_rate": uniform(0.01, 0.08),
            "model__subsample": uniform(0.65, 0.35),
            "model__min_samples_leaf": randint(3, 10),
            "model__max_features": [1, 2, 3, 4],
        },
        n_iter=40,
        cv=5,
        scoring="r2",
        random_state=42,
        n_jobs=-1,
        refit=True,
    )
    reg_search.fit(X, y_log)
    best_reg = reg_search.best_estimator_

    # Hold-out evaluation
    X_tr, X_te, y_tr_log, y_te_log = train_test_split(
        X, y_log, test_size=0.2, random_state=42
    )
    best_reg.fit(X_tr, y_tr_log)
    preds_log = best_reg.predict(X_te)
    preds = np.expm1(preds_log)
    actuals = np.expm1(y_te_log)

    cv_r2 = cross_val_score(best_reg, X, y_log, cv=5, scoring="r2")

    _model_stats["regression"] = {
        "r2_score": round(float(r2_score(actuals, preds)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(actuals, preds))), 2),
        "mae": round(float(np.mean(np.abs(actuals - preds))), 2),
        "cv_r2_mean": round(float(cv_r2.mean()), 4),
        "cv_r2_std": round(float(cv_r2.std()), 4),
        "best_params": {
            k.replace("model__", ""): (int(v) if isinstance(v, (np.integer,)) else round(float(v), 5))
            for k, v in reg_search.best_params_.items()
        },
        "features": ["area", "log₁₊ₐ(area)", "√area", "1/(area+1)"],
        "target_transform": "log1p → expm1",
    }

    # Retrain on full dataset for production use
    best_reg.fit(X, y_log)
    joblib.dump(best_reg, reg_path)

    # ═══════════════════════════════════════════════════════════════
    #  CLASSIFICATION  — predict Size Category from Area
    # ═══════════════════════════════════════════════════════════════
    y_clf = df["Size Category"]

    clf_pipe = Pipeline([
        ("feat", FunctionTransformer(_expand_features, validate=False)),
        ("scale", StandardScaler()),
        ("model", GradientBoostingClassifier(random_state=42)),
    ])

    clf_search = RandomizedSearchCV(
        clf_pipe,
        {
            "model__n_estimators": randint(100, 400),
            "model__max_depth": randint(2, 5),
            "model__learning_rate": uniform(0.02, 0.1),
            "model__subsample": uniform(0.65, 0.35),
            "model__min_samples_leaf": randint(2, 8),
        },
        n_iter=30,
        cv=5,
        scoring="accuracy",
        random_state=42,
        n_jobs=-1,
        refit=True,
    )
    clf_search.fit(X, y_clf)
    best_clf = clf_search.best_estimator_

    X_tr_c, X_te_c, y_tr_c, y_te_c = train_test_split(
        X, y_clf, test_size=0.2, random_state=42
    )
    best_clf.fit(X_tr_c, y_tr_c)
    preds_c = best_clf.predict(X_te_c)

    cv_acc = cross_val_score(best_clf, X, y_clf, cv=5, scoring="accuracy")

    _model_stats["classification"] = {
        "accuracy": round(float(accuracy_score(y_te_c, preds_c)), 4),
        "cv_accuracy_mean": round(float(cv_acc.mean()), 4),
        "cv_accuracy_std": round(float(cv_acc.std()), 4),
        "best_params": {
            k.replace("model__", ""): (int(v) if isinstance(v, (np.integer,)) else round(float(v), 5))
            for k, v in clf_search.best_params_.items()
        },
        "thresholds": {
            "Mega City": f"≥ {_clf_thresholds['mega']:,.0f}",
            "Large City": f"≥ {_clf_thresholds['large']:,.0f}",
            "Medium City": f"< {_clf_thresholds['large']:,.0f}",
        },
    }

    best_clf.fit(X, y_clf)
    joblib.dump(best_clf, clf_path)

    print(
        f"  [REG]  R²={_model_stats['regression']['r2_score']}  "
        f"CV={_model_stats['regression']['cv_r2_mean']}±{_model_stats['regression']['cv_r2_std']}"
    )
    print(
        f"  [CLF]  Acc={_model_stats['classification']['accuracy']}  "
        f"CV={_model_stats['classification']['cv_accuracy_mean']}±{_model_stats['classification']['cv_accuracy_std']}"
    )


# ─── EDA STATS ───────────────────────────────────────────────────
def get_eda_stats() -> Dict[str, Any]:
    """Return all data the frontend charts need — no fake / placeholder rows."""
    df = load_and_clean_data()

    summary = df.describe().to_dict()

    # 1. Top 10 population
    top_10 = (
        df.nlargest(10, "Population (Est.)")
        [["City", "Population (Est.)", "Country", "Area (sq km)", "Density (pop/sq km)"]]
        .to_dict(orient="records")
    )

    # 2. Country frequency (top 10)
    country_dist = df["Country"].value_counts().head(10).to_dict()

    # 3. Full scatter dataset
    scatter = df[["Area (sq km)", "Population (Est.)", "City", "Country"]].to_dict(
        orient="records"
    )

    # 4. Size category counts
    size_dist = df["Size Category"].value_counts().to_dict()

    # 5. Population histogram (10 bins)
    pv = df["Population (Est.)"].values
    edges = np.linspace(pv.min(), pv.max(), 11)
    counts, _ = np.histogram(pv, bins=edges)
    pop_hist = [
        {"bin": f"{edges[i]/1e6:.1f}M – {edges[i+1]/1e6:.1f}M", "count": int(c)}
        for i, c in enumerate(counts)
    ]

    # 6. Area histogram (8 bins)
    av = df["Area (sq km)"].values
    a_edges = np.linspace(av.min(), av.max(), 9)
    a_counts, _ = np.histogram(av, bins=a_edges)
    area_hist = [
        {"bin": f"{a_edges[i]:.0f} – {a_edges[i+1]:.0f}", "count": int(c)}
        for i, c in enumerate(a_counts)
    ]

    # 7. Density leaders (top 10)
    density_leaders = (
        df.nlargest(10, "Density (pop/sq km)")
        [["City", "Country", "Density (pop/sq km)", "Population (Est.)", "Area (sq km)"]]
        .to_dict(orient="records")
    )

    # 8. Pop-vs-Density scatter (top 30 by pop)
    pop_dens = (
        df.nlargest(30, "Population (Est.)")
        [["City", "Population (Est.)", "Density (pop/sq km)"]]
        .to_dict(orient="records")
    )

    correlation = round(float(df["Area (sq km)"].corr(df["Population (Est.)"])), 4)

    return {
        "summary": summary,
        "charts": {
            "top_10_pop": top_10,
            "country_dist": country_dist,
            "scatter": scatter,
            "size_dist": size_dist,
            "pop_histogram": pop_hist,
            "area_histogram": area_hist,
            "density_leaders": density_leaders,
            "pop_vs_density": pop_dens,
            "correlation": correlation,
        },
        "model_performance": (
            _model_stats if _model_stats else {"status": "not_trained"}
        ),
    }


# ─── PREDICTION ENDPOINTS ────────────────────────────────────────
def predict_population(area: float) -> float:
    path = os.path.join(MODEL_DIR, "rf_regressor.pkl")
    if not os.path.exists(path):
        train_models()
    model = joblib.load(path)
    log_pred = model.predict(pd.DataFrame({"Area (sq km)": [area]}))
    return float(np.expm1(log_pred[0]))


def predict_size_category(area: float) -> str:
    path = os.path.join(MODEL_DIR, "rf_classifier.pkl")
    if not os.path.exists(path):
        train_models()
    model = joblib.load(path)
    return str(model.predict(pd.DataFrame({"Area (sq km)": [area]}))[0])