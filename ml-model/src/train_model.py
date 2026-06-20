"""
Train patient monitoring prediction model
Run: python train_model.py
Outputs: model.pkl, scaler.pkl
Requirements: pip install scikit-learn pandas numpy joblib
"""
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def train():
    print("Loading dataset...")
    df = pd.read_csv(os.path.join(ROOT, "data", "raw", "dataset.csv"))
    print(f"Dataset shape: {df.shape}")
    print(f"Label distribution:\n{df['label'].value_counts()}\n")

    # Features and target
    feature_cols = ['age', 'gender', 'heart_rate', 'temperature', 'oxygen', 'fall_detected']
    X = df[feature_cols].values
    y = df['label'].values

    # Encode labels: Emergency=0, Normal=1, Warning=2
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    print(f"Label mapping: {dict(zip(le.classes_, le.transform(le.classes_)))}\n")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )
    print(f"Train size: {len(X_train)}, Test size: {len(X_test)}\n")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # Train Random Forest
    print("Training Random Forest model...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"Accuracy: {accuracy * 100:.2f}%\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    print("Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(pd.DataFrame(cm, index=le.classes_, columns=le.classes_))
    print()

    # Feature importance
    importances = model.feature_importances_
    print("Feature Importances:")
    for feat, imp in sorted(zip(feature_cols, importances), key=lambda x: -x[1]):
        bar = '█' * int(imp * 40)
        print(f"  {feat:<16} {bar} {imp:.4f}")
    print()

    # Save model and scaler
    joblib.dump(model, os.path.join(ROOT, "models", "model.pkl"))
    joblib.dump(scaler, os.path.join(ROOT, "models", "scaler.pkl"))
    joblib.dump(le, os.path.join(ROOT, "models", "label_encoder.pkl"))
    print("Saved: model.pkl, scaler.pkl, label_encoder.pkl")

    # Quick test predictions
    print("\nSample predictions:")
    test_cases = [
        {'name': 'Normal adult',    'data': [40, 1, 75, 98.6, 98, 0]},
        {'name': 'Warning (fever)', 'data': [55, 0, 102, 101.2, 96, 0]},
        {'name': 'Emergency',       'data': [65, 1, 130, 103.0, 90, 0]},
        {'name': 'Fall detected',   'data': [70, 0, 80, 98.0, 98, 1]},
    ]
    for tc in test_cases:
        arr = np.array([tc['data']])
        arr_scaled = scaler.transform(arr)
        pred_idx = model.predict(arr_scaled)[0]
        pred_label = le.inverse_transform([pred_idx])[0]
        proba = model.predict_proba(arr_scaled)[0]
        proba_str = ', '.join([f"{c}:{p:.0%}" for c, p in zip(le.classes_, proba)])
        print(f"  {tc['name']:<22} -> {pred_label:<10} ({proba_str})")

if __name__ == '__main__':
    train()
