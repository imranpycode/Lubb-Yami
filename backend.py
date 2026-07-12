import os
import pickle
import json
import numpy as np
import warnings
from flask import Flask, request, jsonify
from flask_cors import CORS

warnings.filterwarnings("ignore")

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"])

# ── Load models ────────────────────────────────────────────────────────────
LR_MODEL_PATH = os.path.join(os.path.dirname(__file__), "lr_pipeline.pkl")
SVM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "svm_pipeline.pkl")
LUT_PATH = os.path.join(os.path.dirname(__file__), "percentile_lut.json")

imputer_med = None
qt          = None
scalar      = None
lr_model    = None
svm_model   = None
PERCENTILE_LUT = None

try:
    with open(LR_MODEL_PATH, "rb") as f:
        lr_pipeline = pickle.load(f)
    
    with open(SVM_MODEL_PATH, "rb") as f:
        svm_pipeline = pickle.load(f)

    with open(LUT_PATH, "r") as f:
        PERCENTILE_LUT = json.load(f)

    # Both models have identical preprocessing steps since trained on same data
    imputer_med = lr_pipeline.named_steps["imputer"].statistics_
    qt          = lr_pipeline.named_steps["qt"]
    scalar      = lr_pipeline.named_steps["scalar"]
    
    lr_model    = lr_pipeline.named_steps["model"]
    svm_model   = svm_pipeline.named_steps["model"]

    print(f"[OK]  Dual Models loaded successfully (LR + SVM).")
    print(f"[OK]  Imputer medians: {imputer_med}")

except Exception as e:
    import traceback
    print(f"[ERR] Failed to load models: {e}")
    print(traceback.format_exc())

# ── Feature definitions ─────────────────────────────────────────────────────
FEATURE_NAMES = [
    "male", "age", "cigsPerDay", "BPMeds", "prevalentHyp",
    "diabetes", "totChol", "sysBP", "diaBP", "BMI", "heartRate", "glucose"
]

def model_ready() -> bool:
    return all(x is not None for x in [imputer_med, qt, scalar, lr_model, svm_model, PERCENTILE_LUT])

# ── Pipeline execution ───────────────────────────────────────────────────────
def apply_ensemble_pipeline(X: np.ndarray):
    """
    Manually apply preprocessing and then average LR and SVM probabilities.
    Returns (ensemble_pred, ensemble_proba_class1, ensemble_proba_class1).
    """
    X_imp = X.copy().astype(float)
    for col_idx, med in enumerate(imputer_med):
        X_imp[np.isnan(X_imp[:, col_idx]), col_idx] = med

    X_qt = qt.transform(X_imp)
    X_sc = scalar.transform(X_qt)

    # Get probabilities for class 1 (CHD)
    lr_proba = lr_model.predict_proba(X_sc)[:, 1]
    svm_proba = svm_model.predict_proba(X_sc)[:, 1]

    # Ensemble logic: average the probabilities
    ensemble_proba = (lr_proba + svm_proba) / 2.0
    
    # Binary prediction based on 0.5 threshold
    ensemble_preds = (ensemble_proba >= 0.5).astype(int)

    return ensemble_preds, ensemble_proba

def score_to_percentile(prob: float, lut: list) -> float:
    """Map an ensemble probability to a percentile using the LUT."""
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
        "decision_score": float(proba), # Send proba as decision_score for frontend
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
