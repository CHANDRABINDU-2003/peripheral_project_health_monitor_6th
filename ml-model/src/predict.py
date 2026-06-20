"""
STEP 3 — Inference (use this in your OTHER project)
────────────────────────────────────────────────────
Copy these files into your other project folder:
  • predict.py            ← this file
  • model_metadata.json
  • models/rf_model.joblib
  • models/xgb_model.joblib
  • models/scaler.joblib

Usage examples
──────────────
# Single patient dict
from predict import RiskPredictor
predictor = RiskPredictor()
result = predictor.predict({
    "Heart Rate": 95,
    "Respiratory Rate": 20,
    "Body Temperature": 37.2,
    "Oxygen Saturation": 96,
    "Systolic Blood Pressure": 140,
    "Diastolic Blood Pressure": 90,
    "Age": 55,
    "Gender": 1,          # 1=Male, 0=Female
    "Weight (kg)": 82,
    "Height (m)": 1.74,
    "Derived_HRV": 35,
    "Derived_Pulse_Pressure": 50,
    "Derived_BMI": 27.1,
    "Derived_MAP": 106.7
})
print(result)
# → {"label": "High Risk", "risk_class": 1, "probability_high_risk": 0.83, "model_used": "XGBoost"}

# Batch CSV
results_df = predictor.predict_csv("new_patients.csv")
results_df.to_csv("predictions.csv", index=False)
"""

import os, json
import numpy as np
import pandas as pd
import joblib

# ── Locate models relative to this script ─────────────────────────────────────
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RiskPredictor:
    """
    Loads trained RF and XGB models and exposes predict / predict_csv methods.
    By default uses the best model recorded in model_metadata.json.
    Override with model="RandomForest" or model="XGBoost".
    """

    LABEL_MAP = {0: "Low Risk", 1: "High Risk"}

    def __init__(self, base_dir: str = None, model: str = "best"):
        base_dir = base_dir or _ROOT
        meta_path = os.path.join(base_dir, "artifacts", "model_metadata.json")

        with open(meta_path) as f:
            self.meta = json.load(f)

        self.feature_cols = self.meta["feature_columns"]

        # Load scaler
        self._scaler = joblib.load(os.path.join(base_dir, self.meta["scaler_path"]))

        # Load both models
        self._rf  = joblib.load(os.path.join(base_dir, self.meta["rf_model_path"]))
        self._xgb = joblib.load(os.path.join(base_dir, self.meta["xgb_model_path"]))

        # Choose active model
        best = self.meta.get("best_model", "XGBoost")
        chosen = best if model == "best" else model
        self._active_name  = chosen
        self._active_model = self._rf if chosen == "RandomForest" else self._xgb
        print(f"[RiskPredictor] Loaded — active model: {self._active_name}")

    # ── Single prediction ──────────────────────────────────────────────────────
    def predict(self, patient: dict, threshold: float = 0.5) -> dict:
        """
        patient : dict with keys matching FEATURE_COLS
        threshold : probability cutoff for High Risk (default 0.5)
        returns   : dict with label, risk_class, probability_high_risk, model_used
        """
        row = np.array([[patient.get(c, 0) for c in self.feature_cols]], dtype=float)
        row_scaled = self._scaler.transform(row)
        prob_high  = float(self._active_model.predict_proba(row_scaled)[0, 1])
        risk_class = int(prob_high >= threshold)
        return {
            "label"               : self.LABEL_MAP[risk_class],
            "risk_class"          : risk_class,          # 0=Low, 1=High
            "probability_high_risk": round(prob_high, 4),
            "model_used"          : self._active_name,
        }

    # ── Both models, ensemble vote ─────────────────────────────────────────────
    def predict_ensemble(self, patient: dict, threshold: float = 0.5) -> dict:
        """Average probability from RF + XGBoost, then threshold."""
        row = np.array([[patient.get(c, 0) for c in self.feature_cols]], dtype=float)
        row_scaled = self._scaler.transform(row)
        p_rf  = float(self._rf.predict_proba(row_scaled)[0, 1])
        p_xgb = float(self._xgb.predict_proba(row_scaled)[0, 1])
        avg   = (p_rf + p_xgb) / 2
        risk_class = int(avg >= threshold)
        return {
            "label"               : self.LABEL_MAP[risk_class],
            "risk_class"          : risk_class,
            "probability_high_risk": round(avg, 4),
            "prob_rf"             : round(p_rf,  4),
            "prob_xgb"            : round(p_xgb, 4),
            "model_used"          : "Ensemble (RF + XGBoost)",
        }

    # ── SHAP explanation ───────────────────────────────────────────────────────
    def explain(self, patient: dict, threshold: float = 0.5) -> dict:
        """
        Explain a single prediction with SHAP: how much each feature pushed the
        predicted High-Risk probability up (positive) or down (negative).

        Returns: dict with prediction, probability_high_risk, base_value and a
        list of {feature, value, shap, direction}, sorted by |shap| descending.
        """
        import shap

        row = np.array([[patient.get(c, 0) for c in self.feature_cols]], dtype=float)
        row_scaled = self._scaler.transform(row)

        # Build (and cache) a tree explainer for the active tree model.
        if not hasattr(self, "_explainer") or self._explainer is None:
            self._explainer = shap.TreeExplainer(self._active_model)

        raw = self._explainer.shap_values(row_scaled)

        # Normalise SHAP output to the positive (High Risk) class across versions.
        if isinstance(raw, list):                     # [class0_arr, class1_arr]
            vals = np.array(raw[1] if len(raw) > 1 else raw[0])[0]
            ev = self._explainer.expected_value
            base = float(np.ravel(ev)[1]) if np.ravel(ev).size > 1 else float(np.ravel(ev)[0])
        else:
            arr = np.array(raw)
            if arr.ndim == 3:                         # (samples, features, classes)
                vals = arr[0, :, 1] if arr.shape[2] > 1 else arr[0, :, 0]
            else:                                     # (samples, features)
                vals = arr[0]
            ev = self._explainer.expected_value
            base = float(np.ravel(ev)[1]) if np.ravel(ev).size > 1 else float(np.ravel(ev)[0])

        prob_high  = float(self._active_model.predict_proba(row_scaled)[0, 1])
        risk_class = int(prob_high >= threshold)

        contributions = []
        for col, raw_val, shap_val in zip(self.feature_cols, row[0], vals):
            sv = float(shap_val)
            contributions.append({
                "feature"  : col,
                "value"    : round(float(raw_val), 2),
                "shap"     : round(sv, 4),
                "direction": "increases" if sv > 0 else "decreases" if sv < 0 else "neutral",
            })
        contributions.sort(key=lambda c: abs(c["shap"]), reverse=True)

        return {
            "label"               : self.LABEL_MAP[risk_class],
            "probability_high_risk": round(prob_high, 4),
            "base_value"          : round(base, 4),
            "model_used"          : self._active_name,
            "contributions"       : contributions,
        }

    # ── Batch CSV prediction ───────────────────────────────────────────────────
    def predict_csv(self, csv_path: str, threshold: float = 0.5) -> pd.DataFrame:
        """
        Reads a CSV, predicts each row, returns original df + prediction columns.
        Missing feature columns are filled with 0.
        """
        df = pd.read_csv(csv_path)
        df.columns = df.columns.str.strip()
        for col in self.feature_cols:
            if col not in df.columns:
                df[col] = 0

        X = df[self.feature_cols].fillna(0).values.astype(float)
        X_scaled = self._scaler.transform(X)
        probs     = self._active_model.predict_proba(X_scaled)[:, 1]
        preds     = (probs >= threshold).astype(int)

        df["prediction_label"]        = [self.LABEL_MAP[p] for p in preds]
        df["risk_class"]              = preds
        df["probability_high_risk"]   = probs.round(4)
        df["model_used"]              = self._active_name
        return df

    # ── Metadata summary ──────────────────────────────────────────────────────
    def model_info(self) -> dict:
        return {
            "active_model"   : self._active_name,
            "best_model"     : self.meta.get("best_model"),
            "rf_auc"         : self.meta["rf_metrics"]["roc_auc"],
            "xgb_auc"        : self.meta["xgb_metrics"]["roc_auc"],
            "features"       : self.feature_cols,
            "label_map"      : self.LABEL_MAP,
        }


# ── Quick CLI test ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    predictor = RiskPredictor()
    print("\nModel info:", json.dumps(predictor.model_info(), indent=2))

    sample = {
        "Heart Rate": 102, "Respiratory Rate": 24, "Body Temperature": 38.1,
        "Oxygen Saturation": 91, "Systolic Blood Pressure": 155,
        "Diastolic Blood Pressure": 100, "Age": 62, "Gender": 1,
        "Weight (kg)": 95, "Height (m)": 1.70,
        "Derived_HRV": 18, "Derived_Pulse_Pressure": 55,
        "Derived_BMI": 32.9, "Derived_MAP": 118.3
    }
    print("\nSingle prediction:")
    print(json.dumps(predictor.predict(sample), indent=2))

    print("\nEnsemble prediction:")
    print(json.dumps(predictor.predict_ensemble(sample), indent=2))
