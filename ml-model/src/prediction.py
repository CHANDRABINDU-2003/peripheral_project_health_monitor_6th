"""
ML Prediction Microservice — uses YOUR trained RF + XGBoost models
Run: python prediction.py
Listens on: http://localhost:5001
Requirements: pip install flask scikit-learn xgboost numpy joblib pandas
"""
from flask import Flask, request, jsonify
import numpy as np
import os, sys

app = Flask(__name__)

# ── Load models via your RiskPredictor class ──────────────────────────────────
MODEL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, MODEL_DIR)

try:
    from predict import RiskPredictor
    predictor = RiskPredictor(base_dir=MODEL_DIR)
    print("✅ Models loaded via RiskPredictor")
except Exception as e:
    print(f"⚠️  Could not load models: {e}")
    predictor = None

# ── Recommendation map (3-level from API input) ───────────────────────────────
RECOMMENDATIONS = {
    "Low Risk": (
        "Continue regular monitoring. "
        "Stay hydrated — drink 8 glasses of water daily. "
        "Walk at least 20 minutes today. "
        "Aim for 7–8 hours of sleep tonight."
    ),
    "High Risk": (
        "⚠️ Your vitals indicate a High Risk condition. "
        "Rest immediately and avoid any strenuous activity. "
        "Re-measure your vitals within 30 minutes. "
        "Contact your doctor or seek medical attention if symptoms persist or worsen. "
        "This is informational only — please consult a healthcare professional."
    )
}

def derive_features(data: dict) -> dict:
    """Auto-derive BMI, MAP, Pulse Pressure, HRV from raw vitals."""
    weight  = float(data.get("weight_kg", 70))
    height  = float(data.get("height_m") or data.get("height_cm", 170) / 100)
    sbp     = float(data.get("systolic_bp", 120))
    dbp     = float(data.get("diastolic_bp", 80))
    hr      = float(data.get("heart_rate", 75))

    bmi             = weight / (height ** 2)
    pulse_pressure  = sbp - dbp
    map_val         = dbp + (pulse_pressure / 3)
    # HRV approximation: 1000/HR * variability factor (~0.04 typical)
    hrv             = round((1000 / hr) * 0.04 * hr * 0.35, 1) if hr > 0 else 35

    return {
        "Derived_BMI"            : round(bmi, 2),
        "Derived_Pulse_Pressure" : round(pulse_pressure, 1),
        "Derived_MAP"            : round(map_val, 1),
        "Derived_HRV"            : round(hrv, 1),
    }

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model_loaded': predictor is not None})

@app.route('/predict', methods=['POST'])
def predict():
    if predictor is None:
        return jsonify({'error': 'Models not loaded.'}), 503

    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    required = ['heart_rate', 'temperature', 'oxygen']
    for f in required:
        if f not in data:
            return jsonify({'error': f'Missing field: {f}'}), 400

    try:
        derived = derive_features(data)

        patient = {
            "Heart Rate"               : float(data.get("heart_rate", 75)),
            "Respiratory Rate"         : float(data.get("respiratory_rate", 16)),
            "Body Temperature"         : float(data.get("temperature", 37.0)),
            "Oxygen Saturation"        : float(data.get("oxygen", 98)),
            "Systolic Blood Pressure"  : float(data.get("systolic_bp", 120)),
            "Diastolic Blood Pressure" : float(data.get("diastolic_bp", 80)),
            "Age"                      : float(data.get("age", 40)),
            "Gender"                   : float(data.get("gender", 0)),
            "Weight (kg)"              : float(data.get("weight_kg", 70)),
            "Height (m)"               : float(data.get("height_m") or
                                               float(data.get("height_cm", 170)) / 100),
            "Derived_HRV"              : derived["Derived_HRV"],
            "Derived_Pulse_Pressure"   : derived["Derived_Pulse_Pressure"],
            "Derived_BMI"              : derived["Derived_BMI"],
            "Derived_MAP"              : derived["Derived_MAP"],
        }

        # Single model prediction (best model = RandomForest)
        result  = predictor.predict(patient)
        ensemble = predictor.predict_ensemble(patient)

        label = result["label"]   # "Low Risk" or "High Risk"

        # Map to 3-level risk for the frontend
        risk_level = "Normal" if label == "Low Risk" else "Emergency" \
                     if result["probability_high_risk"] >= 0.80 else "Warning"

        return jsonify({
            "prediction"           : risk_level,            # Normal/Warning/Emergency
            "raw_label"            : label,                  # Low Risk / High Risk
            "probability_high_risk": result["probability_high_risk"],
            "prob_rf"              : ensemble["prob_rf"],
            "prob_xgb"             : ensemble["prob_xgb"],
            "model_used"           : result["model_used"],
            "recommendation"       : RECOMMENDATIONS[label],
            "derived_features"     : derived,
        })

    except Exception as e:
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

def build_patient_features(data: dict) -> dict:
    """Build the model's 14-feature dict from raw API input (shared by predict/explain)."""
    derived = derive_features(data)
    return {
        "Heart Rate"               : float(data.get("heart_rate", 75)),
        "Respiratory Rate"         : float(data.get("respiratory_rate", 16)),
        "Body Temperature"         : float(data.get("temperature", 37.0)),
        "Oxygen Saturation"        : float(data.get("oxygen", 98)),
        "Systolic Blood Pressure"  : float(data.get("systolic_bp", 120)),
        "Diastolic Blood Pressure" : float(data.get("diastolic_bp", 80)),
        "Age"                      : float(data.get("age", 40)),
        "Gender"                   : float(data.get("gender", 0)),
        "Weight (kg)"              : float(data.get("weight_kg", 70)),
        "Height (m)"               : float(data.get("height_m") or
                                           float(data.get("height_cm", 170)) / 100),
        "Derived_HRV"              : derived["Derived_HRV"],
        "Derived_Pulse_Pressure"   : derived["Derived_Pulse_Pressure"],
        "Derived_BMI"              : derived["Derived_BMI"],
        "Derived_MAP"              : derived["Derived_MAP"],
    }


@app.route('/explain', methods=['POST'])
def explain():
    """SHAP explanation for a single prediction — per-feature risk contributions."""
    if predictor is None:
        return jsonify({'error': 'Models not loaded.'}), 503

    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    for f in ['heart_rate', 'temperature', 'oxygen']:
        if f not in data:
            return jsonify({'error': f'Missing field: {f}'}), 400

    try:
        patient = build_patient_features(data)
        explanation = predictor.explain(patient)

        label = explanation["label"]
        prob  = explanation["probability_high_risk"]
        risk_level = "Normal" if label == "Low Risk" else "Emergency" if prob >= 0.80 else "Warning"

        return jsonify({
            "prediction"           : risk_level,             # Normal/Warning/Emergency
            "raw_label"            : label,                  # Low Risk / High Risk
            "probability_high_risk": prob,
            "base_value"           : explanation["base_value"],
            "model_used"           : explanation["model_used"] + " + SHAP",
            "contributions"        : explanation["contributions"],
        })

    except Exception as e:
        return jsonify({'error': f'Explanation failed: {str(e)}'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('ML_PORT', 5001))
    print(f"Starting ML service on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
