"""
STEP 2 — Train Random Forest & XGBoost
Run after cleaning: python 2_train_models.py
Outputs (all saved in peripheral_project/models/):
  rf_model.joblib        — Random Forest model
  xgb_model.joblib       — XGBoost model
  scaler.joblib          — StandardScaler fitted on training data
  model_metadata.json    — feature list, thresholds, metrics
  training_report.json   — full evaluation report
"""

import os, json
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble         import RandomForestClassifier
from sklearn.preprocessing    import StandardScaler
from sklearn.model_selection  import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics          import (classification_report, confusion_matrix,
                                      roc_auc_score, f1_score, accuracy_score)
from xgboost                  import XGBClassifier
from imblearn.over_sampling   import SMOTE

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_CSV   = os.path.join(ROOT, "data", "processed", "cleaned_data.csv")
MODEL_DIR  = os.path.join(ROOT, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

TARGET_COL = "Risk Category"

FEATURE_COLS = [
    "Heart Rate", "Respiratory Rate", "Body Temperature",
    "Oxygen Saturation", "Systolic Blood Pressure", "Diastolic Blood Pressure",
    "Age", "Gender", "Weight (kg)", "Height (m)",
    "Derived_HRV", "Derived_Pulse_Pressure", "Derived_BMI", "Derived_MAP"
]

# ── Helpers ────────────────────────────────────────────────────────────────────
def evaluate(name: str, model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    report = classification_report(y_test, y_pred, target_names=["Low Risk","High Risk"], output_dict=True)
    cm     = confusion_matrix(y_test, y_pred).tolist()
    metrics = {
        "model"         : name,
        "accuracy"      : round(accuracy_score(y_test, y_pred), 4),
        "roc_auc"       : round(roc_auc_score(y_test, y_prob), 4),
        "f1_weighted"   : round(f1_score(y_test, y_pred, average="weighted"), 4),
        "f1_high_risk"  : round(report["High Risk"]["f1-score"], 4),
        "precision_hr"  : round(report["High Risk"]["precision"], 4),
        "recall_hr"     : round(report["High Risk"]["recall"], 4),
        "confusion_matrix": cm,
        "classification_report": report,
    }
    print(f"\n  [{name}]")
    print(f"    Accuracy : {metrics['accuracy']}")
    print(f"    ROC-AUC  : {metrics['roc_auc']}")
    print(f"    F1 (High Risk): {metrics['f1_high_risk']}")
    return metrics


def main():
    print("=== Training models ===")

    # ── Load data ──────────────────────────────────────────────────────────────
    df = pd.read_csv(DATA_CSV)
    X  = df[FEATURE_COLS].values
    y  = df[TARGET_COL].values

    # ── Train / test split ────────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── Scale ─────────────────────────────────────────────────────────────────
    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test  = scaler.transform(X_test)

    # ── Handle class imbalance with SMOTE ────────────────────────────────────
    smote = SMOTE(random_state=42)
    X_res, y_res = smote.fit_resample(X_train, y_train)
    print(f"  After SMOTE — Low: {(y_res==0).sum()}  High: {(y_res==1).sum()}")

    # ── Random Forest ─────────────────────────────────────────────────────────
    rf = RandomForestClassifier(
        n_estimators=300, max_depth=None, min_samples_leaf=2,
        class_weight="balanced", random_state=42, n_jobs=-1
    )
    rf.fit(X_res, y_res)
    rf_metrics = evaluate("RandomForest", rf, X_test, y_test)

    # ── XGBoost ───────────────────────────────────────────────────────────────
    scale_pos = int((y_res == 0).sum() / max((y_res == 1).sum(), 1))
    xgb = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=scale_pos,
        use_label_encoder=False, eval_metric="logloss",
        random_state=42, n_jobs=-1
    )
    xgb.fit(X_res, y_res, eval_set=[(X_test, y_test)], verbose=False)
    xgb_metrics = evaluate("XGBoost", xgb, X_test, y_test)

    # ── Cross-validation (5-fold) on full scaled data ────────────────────────
    X_full_scaled = scaler.transform(X)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    rf_cv  = cross_val_score(rf,  X_full_scaled, y, cv=cv, scoring="roc_auc")
    xgb_cv = cross_val_score(xgb, X_full_scaled, y, cv=cv, scoring="roc_auc")
    print(f"\n  5-Fold CV AUC — RF: {rf_cv.mean():.4f} ± {rf_cv.std():.4f}")
    print(f"  5-Fold CV AUC — XGB:{xgb_cv.mean():.4f} ± {xgb_cv.std():.4f}")

    # ── Feature importances ───────────────────────────────────────────────────
    rf_imp  = dict(zip(FEATURE_COLS, rf.feature_importances_.round(4).tolist()))
    xgb_imp = dict(zip(FEATURE_COLS, xgb.feature_importances_.round(4).tolist()))

    # ── Save models & scaler ──────────────────────────────────────────────────
    joblib.dump(rf,     os.path.join(MODEL_DIR, "rf_model.joblib"))
    joblib.dump(xgb,    os.path.join(MODEL_DIR, "xgb_model.joblib"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.joblib"))
    print(f"\n  Models saved → {MODEL_DIR}/")

    # ── Metadata JSON (used by inference script) ──────────────────────────────
    metadata = {
        "feature_columns"   : FEATURE_COLS,
        "target_column"     : TARGET_COL,
        "label_map"         : {"0": "Low Risk", "1": "High Risk"},
        "scaler_path"       : "models/scaler.joblib",
        "rf_model_path"     : "models/rf_model.joblib",
        "xgb_model_path"    : "models/xgb_model.joblib",
        "rf_metrics"        : {k: rf_metrics[k]  for k in ["accuracy","roc_auc","f1_weighted","f1_high_risk"]},
        "xgb_metrics"       : {k: xgb_metrics[k] for k in ["accuracy","roc_auc","f1_weighted","f1_high_risk"]},
        "rf_cv_auc_mean"    : round(float(rf_cv.mean()),  4),
        "xgb_cv_auc_mean"   : round(float(xgb_cv.mean()), 4),
        "best_model"        : "RandomForest" if rf_metrics["roc_auc"] >= xgb_metrics["roc_auc"] else "XGBoost",
        "training_rows"     : len(X_train),
        "test_rows"         : len(X_test),
        "rf_feature_importance" : rf_imp,
        "xgb_feature_importance": xgb_imp,
    }
    meta_path = os.path.join(ROOT, "artifacts", "model_metadata.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  Saved → {meta_path}")

    # ── Full training report ──────────────────────────────────────────────────
    report = {
        "RandomForest" : rf_metrics,
        "XGBoost"      : xgb_metrics,
        "cv_results"   : {
            "rf_auc_mean" : round(float(rf_cv.mean()),  4),
            "rf_auc_std"  : round(float(rf_cv.std()),   4),
            "xgb_auc_mean": round(float(xgb_cv.mean()), 4),
            "xgb_auc_std" : round(float(xgb_cv.std()),  4),
        }
    }
    report_path = os.path.join(ROOT, "artifacts", "training_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"  Saved → {report_path}")
    print("\n=== Training complete ===")


if __name__ == "__main__":
    main()
