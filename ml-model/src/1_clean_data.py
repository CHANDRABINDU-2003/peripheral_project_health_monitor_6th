"""
STEP 1 — Data Cleaning & Preprocessing
Run this first: python 1_clean_data.py
Output: cleaned_data.csv
"""

import pandas as pd
import numpy as np
import json
import os

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_CSV  = os.path.join(ROOT, "data", "raw", "main.csv")
OUTPUT_CSV = os.path.join(ROOT, "data", "processed", "cleaned_data.csv")
STATS_JSON = os.path.join(ROOT, "artifacts", "data_stats.json")

# ── Expected columns ───────────────────────────────────────────────────────────
FEATURE_COLS = [
    "Heart Rate", "Respiratory Rate", "Body Temperature",
    "Oxygen Saturation", "Systolic Blood Pressure", "Diastolic Blood Pressure",
    "Age", "Weight (kg)", "Height (m)",
    "Derived_HRV", "Derived_Pulse_Pressure", "Derived_BMI", "Derived_MAP"
]
GENDER_COL  = "Gender"
TARGET_COL  = "Risk Category"

# ── Clinical valid ranges (for outlier capping) ────────────────────────────────
CLIP_RANGES = {
    "Heart Rate":                (30,  200),
    "Respiratory Rate":          (5,   60),
    "Body Temperature":          (34,  42),
    "Oxygen Saturation":         (70,  100),
    "Systolic Blood Pressure":   (60,  250),
    "Diastolic Blood Pressure":  (30,  150),
    "Age":                       (0,   120),
    "Weight (kg)":               (2,   250),
    "Height (m)":                (0.5, 2.5),
    "Derived_HRV":               (0,   200),
    "Derived_Pulse_Pressure":    (5,   150),
    "Derived_BMI":               (10,  80),
    "Derived_MAP":               (40,  180),
}

def clean(df: pd.DataFrame) -> pd.DataFrame:
    print(f"  Raw rows : {len(df):,}")

    # ── Strip column names ─────────────────────────────────────────────────────
    df.columns = df.columns.str.strip()

    # ── Drop timestamp (not a feature) ────────────────────────────────────────
    df.drop(columns=["Timestamp"], errors="ignore", inplace=True)

    # ── Target: normalise label to 0 / 1 ──────────────────────────────────────
    df[TARGET_COL] = df[TARGET_COL].astype(str).str.strip().str.lower()
    df[TARGET_COL] = df[TARGET_COL].map(
        lambda v: 1 if any(x in v for x in ["high", "1"]) else 0
    )
    df.dropna(subset=[TARGET_COL], inplace=True)

    # ── Gender → binary (Female=0, Male=1, unknown=0) ─────────────────────────
    df[GENDER_COL] = df[GENDER_COL].astype(str).str.strip().str.lower()
    df[GENDER_COL] = df[GENDER_COL].map(lambda v: 1 if "m" in v else 0)

    # ── Numeric coercion ───────────────────────────────────────────────────────
    for col in FEATURE_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # ── Missing value imputation (median per gender group) ────────────────────
    for col in FEATURE_COLS:
        if col in df.columns and df[col].isna().any():
            df[col] = df.groupby(GENDER_COL)[col].transform(
                lambda s: s.fillna(s.median())
            )
            # fallback global median
            df[col].fillna(df[col].median(), inplace=True)

    # ── Clip outliers to clinical ranges ─────────────────────────────────────
    for col, (lo, hi) in CLIP_RANGES.items():
        if col in df.columns:
            df[col] = df[col].clip(lo, hi)

    # ── Drop remaining NaN rows ───────────────────────────────────────────────
    df.dropna(inplace=True)

    print(f"  Clean rows: {len(df):,}")
    print(f"  Class distribution:\n{df[TARGET_COL].value_counts().to_string()}")
    return df


def main():
    print("=== Cleaning dataset ===")
    df_raw = pd.read_csv(INPUT_CSV)
    df     = clean(df_raw.copy())
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\n  Saved → {OUTPUT_CSV}")

    # ── Save basic stats for reference ────────────────────────────────────────
    stats = {
        "total_rows"        : int(len(df)),
        "low_risk_count"    : int((df[TARGET_COL] == 0).sum()),
        "high_risk_count"   : int((df[TARGET_COL] == 1).sum()),
        "feature_columns"   : FEATURE_COLS + [GENDER_COL],
        "target_column"     : TARGET_COL,
        "label_map"         : {"0": "Low Risk", "1": "High Risk"},
    }
    with open(STATS_JSON, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"  Saved → {STATS_JSON}")


if __name__ == "__main__":
    main()
