/**
 * riskScore.js — Computes a 0–100 health risk score from a patient's vitals.
 *
 * The score is additive: each vital contributes severity points based on how far
 * it deviates from the healthy range. Points are summed and capped at 100.
 *
 * Example: Heart Rate 125, Temperature 101°F, SpO₂ 91%
 *          → 33 + 22 + 33 = 88/100  (Critical)
 */

function heartRatePoints(hr) {
  if (hr == null || isNaN(hr)) return 0;
  if (hr >= 130 || hr <= 35) return 38;
  if (hr >= 120 || hr <= 40) return 33;
  if (hr >= 110 || hr <= 45) return 25;
  if (hr >= 101 || hr <= 50) return 15;
  if (hr >= 91  || hr <= 55) return 6;
  return 0; // 56–90 bpm
}

function temperaturePoints(temp) {
  if (temp == null || isNaN(temp)) return 0;
  if (temp >= 105 || temp <= 93) return 35;
  if (temp >= 104) return 30;
  if (temp >= 103) return 26;
  if (temp >= 102) return 24;
  if (temp >= 101) return 22;
  if (temp >= 100.4) return 16;
  if (temp >= 99.5) return 8;
  if (temp <= 95)  return 30; // hypothermia
  return 0; // 95.1–99.4 °F
}

function oxygenPoints(spo2) {
  if (spo2 == null || isNaN(spo2)) return 0;
  if (spo2 < 85) return 45;
  if (spo2 < 88) return 38;
  if (spo2 < 90) return 35;
  if (spo2 < 92) return 33;
  if (spo2 < 94) return 20;
  if (spo2 < 95) return 10;
  return 0; // 95–100 %
}

// ── 10 granular risk levels (each with a label, color and 3 tips) ─────────────
const RISK_LEVELS = [
  { max: 10,  level: 'Excellent',      color: '#0E9F6E', tips: [
    ['Your health indicators are currently excellent.', 'Continue your healthy lifestyle and regular monitoring.'],
    ['Maintain proper hydration and balanced nutrition.', 'Small healthy habits help preserve long-term wellness.'],
    ['No significant concerns are detected at this time.', 'Continue routine physical activity and quality sleep.'],
  ]},
  { max: 20,  level: 'Very Good',      color: '#2FA968', tips: [
    ['Your health status appears very stable.', 'Keep following your current health routine consistently.'],
    ['Regular exercise and healthy meals are recommended.', 'Monitoring trends over time remains important.'],
    ['Preventive care is still valuable even at low risk.', 'Schedule routine checkups when appropriate.'],
  ]},
  { max: 30,  level: 'Good',           color: '#6FAE3C', tips: [
    ['Most indicators are within acceptable ranges.', 'Pay attention to any unusual symptoms that develop.'],
    ['Consider improving sleep quality and daily activity levels.', 'Small adjustments can further reduce health risks.'],
    ['Continue monitoring your vital signs periodically.', 'Early awareness supports better health outcomes.'],
  ]},
  { max: 40,  level: 'Mild Risk',      color: '#C9A227', tips: [
    ['Some measurements show mild deviation from ideal values.', 'Monitor your condition more frequently.'],
    ['Focus on hydration, balanced meals, and stress reduction.', 'Healthy routines may improve future readings.'],
    ['Consult a healthcare provider if symptoms persist.', 'Regular tracking is recommended.'],
  ]},
  { max: 50,  level: 'Moderate Risk',  color: '#E0962A', tips: [
    ['Your risk score suggests moderate health concerns.', 'Observe any changes in symptoms carefully.'],
    ['Avoid excessive physical strain until readings improve.', 'Ensure sufficient rest and recovery.'],
    ['Professional medical advice may be beneficial.', 'Continue monitoring your health metrics regularly.'],
  ]},
  { max: 60,  level: 'Elevated Risk',  color: '#E07B27', tips: [
    ['Several indicators require increased attention.', 'Monitor your vital signs more frequently.'],
    ['Maintain medication schedules and healthy habits if applicable.', 'Avoid activities that may worsen symptoms.'],
    ['Consider consulting a healthcare professional soon.', 'Early intervention may prevent complications.'],
  ]},
  { max: 70,  level: 'High Risk',      color: '#DB6020', tips: [
    ['Your health data indicates a high level of concern.', 'Careful monitoring is strongly recommended.'],
    ['Avoid strenuous activities and prioritize rest.', 'Pay attention to any worsening symptoms.'],
    ['Seek medical evaluation in the near future.', 'Professional assessment is advised.'],
  ]},
  { max: 80,  level: 'Very High Risk', color: '#DC3545', tips: [
    ['Your risk score is significantly elevated.', 'Immediate health monitoring is recommended.'],
    ['Limit physical exertion and follow medical guidance.', 'Do not ignore persistent symptoms.'],
    ['Contact a healthcare professional as soon as possible.', 'Prompt action may reduce complications.'],
  ]},
  { max: 90,  level: 'Severe Risk',    color: '#B82435', tips: [
    ['Critical health concerns may be present.', 'Seek professional medical attention promptly.'],
    ['Monitor symptoms continuously and avoid risky activities.', 'Ensure someone can assist if needed.'],
    ['Follow healthcare recommendations without delay.', 'Your condition may require urgent evaluation.'],
  ]},
  { max: 100, level: 'Critical Risk',  color: '#8B1118', tips: [
    ['Critical risk has been detected.', 'Immediate medical attention is strongly recommended.'],
    ['Contact emergency healthcare services if severe symptoms occur.', 'Do not delay seeking professional help.'],
    ['Continue monitoring while arranging urgent medical care.', 'Prompt intervention is essential for safety.'],
  ]},
];

function getRiskLevel(score) {
  return RISK_LEVELS.find(l => score <= l.max) || RISK_LEVELS[RISK_LEVELS.length - 1];
}

/**
 * @param {Object} vitals { heart_rate, temperature, oxygen, fall_detected }
 * @returns {Object} { score, band, level, color, tips, breakdown }
 */
function computeRiskScore(vitals = {}) {
  const hr   = parseFloat(vitals.heart_rate);
  const temp = parseFloat(vitals.temperature);
  const spo2 = parseFloat(vitals.oxygen);
  const fall = vitals.fall_detected === true ||
               vitals.fall_detected === 'true' || vitals.fall_detected === 1;

  const breakdown = {
    heart_rate : heartRatePoints(hr),
    temperature: temperaturePoints(temp),
    oxygen     : oxygenPoints(spo2),
    fall       : fall ? 20 : 0,
  };

  let score = breakdown.heart_rate + breakdown.temperature +
              breakdown.oxygen + breakdown.fall;
  score = Math.min(100, Math.max(0, Math.round(score)));

  // Coarse band (kept for badges): Low 0–33 · High 34–66 · Emergency 67–100
  let band;
  if (score >= 67)      band = 'Emergency';
  else if (score >= 34) band = 'High';
  else                  band = 'Low';

  // Granular level (1 of 10) drives the colour and the health tips
  const lvl = getRiskLevel(score);

  return {
    score,
    band,
    level: lvl.level,
    color: lvl.color,
    tips : lvl.tips,
    breakdown,
  };
}

module.exports = { computeRiskScore };
