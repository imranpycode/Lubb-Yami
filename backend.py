import os
import pickle
import json
import numpy as np
import warnings
from flask import Flask, request, jsonify
from flask_cors import CORS

warnings.filterwarnings("ignore")

app = Flask(__name__)
CORS(app)

# ── Globals ────────────────────────────────────────────────────────────
LR_MODEL_PATH = os.path.join(os.path.dirname(__file__), "lr_pipeline.pkl")
SVM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "svm_pipeline.pkl")
LUT_PATH = os.path.join(os.path.dirname(__file__), "percentile_lut.json")
CSV_PATH = os.path.join(os.path.dirname(__file__), "framingham.csv")

imputer_med = None
qt          = None
scalar      = None
lr_model    = None
svm_model   = None
PERCENTILE_LUT = None

# ── Feature definitions ─────────────────────────────────────────────────────
FEATURE_NAMES = [
    "male", "age", "cigsPerDay", "BPMeds", "prevalentHyp",
    "diabetes", "totChol", "sysBP", "diaBP", "BMI", "heartRate", "glucose"
]

def train_and_save_fallback():
    """Fallback function to retrain models if unpickling fails due to version mismatches."""
    global imputer_med, qt, scalar, lr_model, svm_model, PERCENTILE_LUT
    print("[INFO] Retraining models from framingham.csv...")
    try:
        import pandas as pd
        from sklearn.pipeline import Pipeline
        from sklearn.impute import SimpleImputer
        from sklearn.preprocessing import QuantileTransformer, StandardScaler
        from sklearn.svm import SVC
        from sklearn.linear_model import LogisticRegression

        df = pd.read_csv(CSV_PATH)
        target = "TenYearCHD"
        df = df.dropna(subset=[target])
        X = df[FEATURE_NAMES]
        y = df[target]

        # Fit LR
        lr_pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('qt', QuantileTransformer(output_distribution='normal', n_quantiles=1000, random_state=42)),
            ('scalar', StandardScaler()),
            ('model', LogisticRegression(max_iter=1000, random_state=42))
        ])
        lr_pipeline.fit(X, y)

        # Fit SVM
        svm_pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('qt', QuantileTransformer(output_distribution='normal', n_quantiles=1000, random_state=42)),
            ('scalar', StandardScaler()),
            ('model', SVC(C=0.1, gamma='scale', kernel='rbf', probability=True, random_state=42))
        ])
        svm_pipeline.fit(X, y)

        # Compute averaged probabilities for LUT
        lr_probs = lr_pipeline.predict_proba(X)[:, 1]
        svm_probs = svm_pipeline.predict_proba(X)[:, 1]
        ensemble_probs = (lr_probs + svm_probs) / 2.0
        sorted_probs = np.sort(ensemble_probs).tolist()

        if len(sorted_probs) > 1000:
            indices = np.linspace(0, len(sorted_probs)-1, 1000).astype(int)
            sorted_probs = [sorted_probs[i] for i in indices]

        # Extract steps
        imputer_med = lr_pipeline.named_steps["imputer"].statistics_
        qt          = lr_pipeline.named_steps["qt"]
        scalar      = lr_pipeline.named_steps["scalar"]
        lr_model    = lr_pipeline.named_steps["model"]
        svm_model   = svm_pipeline.named_steps["model"]
        PERCENTILE_LUT = sorted_probs

        # Save to disk to avoid retraining next time if server stays warm
        with open(LR_MODEL_PATH, 'wb') as f:
            pickle.dump(lr_pipeline, f)
        with open(SVM_MODEL_PATH, 'wb') as f:
            pickle.dump(svm_pipeline, f)
        with open(LUT_PATH, 'w') as f:
            json.dump(sorted_probs, f)

        print("[OK] Retraining complete. Loaded fresh models successfully.")
    except Exception as e:
        import traceback
        print(f"[ERR] Fallback training failed: {e}")
        print(traceback.format_exc())

# Load and validate models
try:
    with open(LR_MODEL_PATH, "rb") as f:
        lr_pipeline = pickle.load(f)
    
    with open(SVM_MODEL_PATH, "rb") as f:
        svm_pipeline = pickle.load(f)

    with open(LUT_PATH, "r") as f:
        PERCENTILE_LUT = json.load(f)

    imputer_med = lr_pipeline.named_steps["imputer"].statistics_
    qt          = lr_pipeline.named_steps["qt"]
    scalar      = lr_pipeline.named_steps["scalar"]
    lr_model    = lr_pipeline.named_steps["model"]
    svm_model   = svm_pipeline.named_steps["model"]

    # VALIDATION STEP: Test predict_proba on the models to catch version-mismatched objects!
    dummy_sc = scalar.transform(qt.transform(imputer_med.reshape(1, -1)))
    lr_model.predict_proba(dummy_sc)
    svm_model.predict_proba(dummy_sc)

    print(f"[OK] Dual Models loaded and validated successfully (LR + SVM).")

except Exception as e:
    print(f"[WARN] Model validation failed: {e}. Attempting auto-retrain...")
    train_and_save_fallback()

def model_ready() -> bool:
    return all(x is not None for x in [imputer_med, qt, scalar, lr_model, svm_model, PERCENTILE_LUT])

# ── Pipeline execution ───────────────────────────────────────────────────────
def apply_ensemble_pipeline(X: np.ndarray):
    X_imp = X.copy().astype(float)
    for col_idx, med in enumerate(imputer_med):
        X_imp[np.isnan(X_imp[:, col_idx]), col_idx] = med

    X_qt = qt.transform(X_imp)
    X_sc = scalar.transform(X_qt)

    lr_proba = lr_model.predict_proba(X_sc)[:, 1]
    svm_proba = svm_model.predict_proba(X_sc)[:, 1]

    ensemble_proba = (lr_proba + svm_proba) / 2.0
    ensemble_preds = (ensemble_proba >= 0.5).astype(int)

    return ensemble_preds, ensemble_proba

def score_to_percentile(prob: float, lut: list) -> float:
    if not lut:
        return 0.0
    if prob <= lut[0]:   return 0.0
    if prob >= lut[-1]:  return 100.0
    for i in range(len(lut) - 1):
        if lut[i] <= prob <= lut[i + 1]:
            t = (prob - lut[i]) / (lut[i + 1] - lut[i]) if lut[i + 1] != lut[i] else 0
            return float(i + t) / (len(lut) - 1) * 100.0
    return 100.0

def risk_band(pct: float) -> str:
    if pct < 33: return "low"
    if pct < 66: return "mid"
    return "high"

def patient_to_row(data: dict) -> list:
    return [float(data.get(f, float("nan"))) for f in FEATURE_NAMES]

def build_result(pred, proba, lut) -> dict:
    pct = score_to_percentile(float(proba), lut)
    band = risk_band(pct)
    return {
        "prediction": int(pred),
        "probability_chd": float(proba),
        "probability_no_chd": float(1.0 - proba),
        "decision_score": float(proba),
        "percentile": float(pct),
        "risk_band": band,
        "risk_percent": round(float(proba) * 100, 2)
    }

# ── API Routes ──────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if model_ready() else "error",
        "model_loaded": model_ready(),
        "features": FEATURE_NAMES
    })

@app.route("/api/predict", methods=["POST"])
def predict():
    if not model_ready():
        return jsonify({"error": "Models not loaded on server"}), 503

    body = request.get_json(force=True, silent=True)
    if not body:
        return jsonify({"error": "Invalid or empty JSON body"}), 400

    try:
        X = np.array([patient_to_row(body)])
        preds, probas = apply_ensemble_pipeline(X)
        return jsonify(build_result(preds[0], probas[0], PERCENTILE_LUT))
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/api/predict/batch", methods=["POST"])
def predict_batch():
    if not model_ready():
        return jsonify({"error": "Models not loaded on server"}), 503

    body = request.get_json(force=True, silent=True)
    if not body:
        return jsonify({"error": "Invalid or empty JSON body"}), 400

    patients = body.get("patients")
    if not isinstance(patients, list) or len(patients) == 0:
        return jsonify({"error": "patients must be a non-empty list"}), 400

    try:
        X = np.array([patient_to_row(p) for p in patients])
        preds, probas = apply_ensemble_pipeline(X)
        results = [
            build_result(preds[i], probas[i], PERCENTILE_LUT)
            for i in range(len(patients))
        ]
        return jsonify({"results": results})
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
