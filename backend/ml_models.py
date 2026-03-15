import pandas as pd
import numpy as np
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import mean_squared_error, accuracy_score
from typing import Dict, Any

DATA_PATH = r"D:\Projects\Python-DataXplore\Dataset\Top 100 Worlds Largest Cities.csv"

def load_and_clean_data() -> pd.DataFrame:
    """Loads and cleans the dataset, replacing missing values and outliers."""
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Dataset not found at {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    for col in ['Population (Est.)', 'Area (sq km)']:
        if pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
            df[col] = df[col].astype(str).str.replace(',', '', regex=False).astype(float)

    # Handle Missing Values (Imputation as per unit-1 pdf)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    # Fill missing values with median
    if df[numeric_cols].isnull().sum().sum() > 0:
         df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
    
    # We will derive a Density column for EDA and Classification
    df['Density (pop/sq km)'] = df['Population (Est.)'] / df['Area (sq km)']

    # Create a categorical column 'Size Category' for Classification task
    # e.g., Mega City (>15M), Large City (10M-15M), Medium City (<10M)
    def categorize_size(pop):
        if pop > 15000000:
            return 'Mega City'
        elif pop > 10000000:
            return 'Large City'
        else:
            return 'Medium City'
            
    df['Size Category'] = df['Population (Est.)'].apply(categorize_size)
    return df

def get_eda_stats() -> Dict[str, Any]:
    """Provides summary statistics for univariate/bivariate analysis in frontend."""
    df = load_and_clean_data()
    
    # Univariate stats
    stats = df.describe().to_dict()
    
    # Scatter plot data (Bivariate: Area vs Population)
    scatter_data = df[['Area (sq km)', 'Population (Est.)', 'City', 'Country']].to_dict(orient='records')

    # Top 10 cities by population (Bar chart)
    top_10_pop = df.nlargest(10, 'Population (Est.)')[['City', 'Population (Est.)']].to_dict(orient='records')
    
    # Count of cities by country (Pie/Bar chart)
    country_dist = df['Country'].value_counts().head(10).to_dict()
    
    # City Size Category Distribution (Polar Area / Doughnut)
    size_dist = df['Size Category'].value_counts().to_dict()
    
    # Line chart representation - Population vs Density for top 20
    top_20 = df.nlargest(20, 'Population (Est.)')
    line_data = top_20[['City', 'Population (Est.)', 'Density (pop/sq km)']].to_dict(orient='records')

    return {
        "summary": stats,
        "scatter": scatter_data,
        "top_10": top_10_pop,
        "country_distribution": country_dist,
        "size_distribution": size_dist,
        "line_data": line_data
    }

from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.model_selection import GridSearchCV, train_test_split

# Ensure global models so they persist in memory
_rf_regressor = None
_rf_classifier = None

def train_models():
    """Trains regression and classification models with enhanced accuracy via GridSearch and Pipelines."""
    global _rf_regressor, _rf_classifier
    df = load_and_clean_data()

    # --- ADVANCED REGRESSION PIPELINE ---
    # Predicting Population based on Area (sq km). We add Polynomial Features to detect non-linear curves.
    X_reg = df[['Area (sq km)']]
    y_reg = df['Population (Est.)']
    
    X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)
    
    # Establish a Pipeline that Scales data, adds polynomial dimension, then applies a tuned Random Forest
    reg_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('poly', PolynomialFeatures(degree=2, include_bias=False)), # Detect curves in area vs pop
        ('rf', RandomForestRegressor(random_state=42))
    ])
    
    # Hyperparameter Grid Search for best accuracy
    reg_param_grid = {
        'rf__n_estimators': [50, 100, 200],
        'rf__max_depth': [None, 10, 20],
        'rf__min_samples_split': [2, 5]
    }
    
    reg_grid = GridSearchCV(reg_pipeline, reg_param_grid, cv=3, scoring='neg_mean_squared_error', n_jobs=-1)
    reg_grid.fit(X_train_r, y_train_r)
    _rf_regressor = reg_grid.best_estimator_

    # --- ADVANCED CLASSIFICATION PIPELINE ---
    # Predict Size Category based on Area
    X_clf = df[['Area (sq km)']]
    y_clf = df['Size Category']
    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)
    
    clf_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('rf', RandomForestClassifier(random_state=42, class_weight='balanced'))
    ])
    
    clf_param_grid = {
        'rf__n_estimators': [50, 100, 200],
        'rf__max_depth': [None, 5, 10],
    }

    clf_grid = GridSearchCV(clf_pipeline, clf_param_grid, cv=3, scoring='accuracy', n_jobs=-1)
    clf_grid.fit(X_train_c, y_train_c)
    _rf_classifier = clf_grid.best_estimator_

def predict_population(area: float) -> float:
    """Uses the trained regression pipeline."""
    if _rf_regressor is None:
        train_models()
    # Predict expects a 2D array representing features
    return _rf_regressor.predict(pd.DataFrame({'Area (sq km)': [area]}))[0]

def predict_size_category(area: float) -> str:
    """Uses the trained classification pipeline."""
    if _rf_classifier is None:
        train_models()
    return _rf_classifier.predict(pd.DataFrame({'Area (sq km)': [area]}))[0]

if __name__ == "__main__":
    # Test script locally
    train_models()
    print("Enhanced Models trained successfully via GridSearchCV!")
    print("Test Prediction (Area 3000):", predict_population(3000))
    print("Test Classification (Area 3000):", predict_size_category(3000))

