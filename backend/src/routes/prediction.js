const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { verifyToken } = require('../middleware/authMiddleware');
const { computeRiskScore } = require('../utils/riskScore');

// POST /api/predict — predict without saving
router.post('/predict', verifyToken, async (req, res) => {
  try {
    const { heart_rate, temperature, oxygen } = req.body;
    if (!heart_rate || !temperature || !oxygen) {
      return res.status(400).json({ error: 'heart_rate, temperature, oxygen are required.' });
    }
    const result = await runPrediction(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Prediction failed', message: error.message });
  }
});

// POST /api/explain — SHAP feature contributions for a prediction
router.post('/explain', verifyToken, async (req, res) => {
  try {
    const { heart_rate, temperature, oxygen } = req.body;
    if (!heart_rate || !temperature || !oxygen) {
      return res.status(400).json({ error: 'heart_rate, temperature, oxygen are required.' });
    }
    const result = await runExplanation(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Explanation failed', message: error.message });
  }
});

// Tries the Python SHAP service; falls back to a rule-based contribution estimate.
async function runExplanation(data) {
  if (process.env.ML_SERVICE_URL) {
    try {
      const response = await axios.post(
        `${process.env.ML_SERVICE_URL}/explain`, data, { timeout: 8000 }
      );
      return response.data;
    } catch (mlError) {
      console.warn('SHAP service unavailable, using rule-based explanation:', mlError.message);
    }
  }
  return ruleBasedExplanation(data);
}

// Degraded explanation when the SHAP service is offline: derive per-vital
// contributions from the same risk-score breakdown the app already uses, so
// the UI always shows *why* a risk level was reached.
function ruleBasedExplanation(data) {
  const hr   = parseFloat(data.heart_rate);
  const temp = parseFloat(data.temperature);   // °F (frontend sends °C for ML; rule-based expects °F)
  const spo2 = parseFloat(data.oxygen);
  const fall = data.fall_detected === true || data.fall_detected === 'true' || data.fall_detected === 1;

  // The risk util expects °F. The /explain frontend payload sends °C for the ML
  // model, so convert back to °F here if the value looks like Celsius (< 60).
  const tempF = temp < 60 ? (temp * 9 / 5) + 32 : temp;

  const risk = computeRiskScore({ heart_rate: hr, temperature: tempF, oxygen: spo2, fall_detected: fall });
  const b = risk.breakdown;

  // Positive shap = increases risk. Healthy vitals (0 points) get a small
  // negative value so they read as "decreases risk".
  const mk = (feature, value, points) => ({
    feature,
    value: Math.round(value * 100) / 100,
    shap: points > 0 ? Math.round((points / 100) * 1000) / 1000 : -0.02,
    direction: points > 0 ? 'increases' : 'decreases',
  });

  const contributions = [
    mk('Heart Rate',        hr,    b.heart_rate),
    mk('Oxygen Saturation', spo2,  b.oxygen),
    mk('Body Temperature',  tempF, b.temperature),
  ];
  if (fall) contributions.push({ feature: 'Fall Detected', value: 1, shap: Math.round((b.fall / 100) * 1000) / 1000, direction: 'increases' });
  contributions.sort((a, c) => Math.abs(c.shap) - Math.abs(a.shap));

  const prediction = risk.score >= 67 ? 'Emergency' : risk.score >= 34 ? 'Warning' : 'Normal';

  return {
    prediction,
    raw_label: risk.score >= 34 ? 'High Risk' : 'Low Risk',
    probability_high_risk: Math.min(0.99, risk.score / 100),
    base_value: 0,
    model_used: 'Rule-based (SHAP service offline)',
    contributions,
  };
}

// ── Core prediction: tries ML service, falls back to rule-based ───────────────
async function runPrediction(data) {
  if (process.env.ML_SERVICE_URL) {
    try {
      const response = await axios.post(
        `${process.env.ML_SERVICE_URL}/predict`, data, { timeout: 5000 }
      );
      return response.data;
    } catch (mlError) {
      console.warn('ML service unavailable, using rule-based fallback:', mlError.message);
    }
  }
  return ruleBased(data);
}

// ── Rule-based fallback (matches your model's logic) ─────────────────────────
function ruleBased({ heart_rate, temperature, oxygen, fall_detected,
                     systolic_bp = 120, diastolic_bp = 80 }) {
  const hr   = parseFloat(heart_rate);
  const temp = parseFloat(temperature);
  const spo2 = parseFloat(oxygen);
  const sbp  = parseFloat(systolic_bp);
  let prediction = 'Normal';
  let reasons = [];

  if ((hr > 120 && spo2 < 92) || fall_detected || (temp > 103.5) || sbp > 180) {
    prediction = 'Emergency';
    if (hr > 120 && spo2 < 92) reasons.push('Critical: high heart rate + low oxygen');
    if (fall_detected)          reasons.push('Fall detected');
    if (temp > 103.5)           reasons.push('Dangerously high temperature');
    if (sbp > 180)              reasons.push('Hypertensive crisis');
  } else if (
    (temp > 100.4 && hr > 100) || hr > 110 || hr < 50 ||
    spo2 < 95 || temp > 102 || sbp > 140
  ) {
    prediction = 'Warning';
    if (temp > 100.4) reasons.push('Fever detected');
    if (hr > 110)     reasons.push('High heart rate (tachycardia)');
    if (hr < 50)      reasons.push('Low heart rate (bradycardia)');
    if (spo2 < 95)    reasons.push('Low oxygen saturation');
    if (sbp > 140)    reasons.push('Elevated blood pressure');
  } else {
    reasons.push('All vitals within normal range');
  }

  const recommendations = {
    Normal: 'Continue regular monitoring. Stay hydrated — drink 8 glasses of water daily. Walk at least 20 minutes today. Aim for 7–8 hours of sleep tonight.',
    Warning: 'Rest and avoid strenuous activity. Re-measure vitals in 30 minutes. Contact your doctor if symptoms worsen. ⚠️ Informational only — please consult a healthcare professional.',
    Emergency: '🚨 Seek immediate medical attention. Call emergency services now. Do not stay alone. Do not drive yourself. ⚠️ Informational only — call emergency services immediately.'
  };

  return {
    prediction,
    raw_label    : prediction === 'Normal' ? 'Low Risk' : 'High Risk',
    recommendation: recommendations[prediction],
    reasons,
    model_used   : 'Rule-Based Fallback',
    probability_high_risk: prediction === 'Normal' ? 0.1 : prediction === 'Warning' ? 0.6 : 0.9,
  };
}

module.exports = router;
module.exports.runPrediction = runPrediction;
