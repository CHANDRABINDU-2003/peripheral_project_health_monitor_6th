/* ========================================================================
   shap.js — Shared SHAP explanation helpers
   ------------------------------------------------------------------------
   SHAP breaks a model's risk prediction into per-feature contributions:
   how much each input (heart rate, oxygen, BMI, …) pushed the predicted
   risk up (positive) or down (negative). This file builds the request
   payload, calls /api/explain, and renders the contributions as diverging
   bars. Used by both the reports page and the doctor dashboard.
   ======================================================================== */

// Friendly labels + icons for the model's raw feature column names.
const SHAP_FEATURE_META = {
  'Heart Rate'               : { label: 'Heart Rate',        icon: '❤️',  unit: 'bpm' },
  'Respiratory Rate'         : { label: 'Respiratory Rate',  icon: '🫁',  unit: '/min' },
  'Body Temperature'         : { label: 'Temperature',       icon: '🌡️', unit: '°C' },
  'Oxygen Saturation'        : { label: 'Oxygen (SpO₂)',     icon: '💧',  unit: '%' },
  'Systolic Blood Pressure'  : { label: 'Systolic BP',       icon: '🩸',  unit: 'mmHg' },
  'Diastolic Blood Pressure' : { label: 'Diastolic BP',      icon: '🩸',  unit: 'mmHg' },
  'Age'                      : { label: 'Age',               icon: '🎂',  unit: 'yrs' },
  'Gender'                   : { label: 'Gender',            icon: '⚧',   unit: '' },
  'Weight (kg)'              : { label: 'Weight',            icon: '⚖️',  unit: 'kg' },
  'Height (m)'               : { label: 'Height',            icon: '📏',  unit: 'm' },
  'Derived_HRV'              : { label: 'Heart Rate Variability', icon: '📈', unit: 'ms' },
  'Derived_Pulse_Pressure'   : { label: 'Pulse Pressure',    icon: '〽️', unit: 'mmHg' },
  'Derived_BMI'              : { label: 'BMI',               icon: '🧮',  unit: '' },
  'Derived_MAP'              : { label: 'Mean Arterial Pressure', icon: '🩺', unit: 'mmHg' },
};

// Build the ML feature payload from a stored report + patient profile.
// Temperature is stored in °F in the DB; the model expects °C.
function buildExplainPayload(report, patient) {
  const fToC = (f) => (parseFloat(f) - 32) * 5 / 9;
  return {
    heart_rate    : parseFloat(report.heart_rate),
    temperature   : Math.round(fToC(report.temperature) * 10) / 10,
    oxygen        : parseFloat(report.oxygen),
    fall_detected : !!report.fall_detected,
    age           : patient && patient.age ? parseFloat(patient.age) : 40,
    gender        : patient && patient.gender === 'Male' ? 1 : 0,
    weight_kg     : patient && patient.weight ? parseFloat(patient.weight) : 70,
    height_cm     : patient && patient.height ? parseFloat(patient.height) : 170,
    respiratory_rate : 16,
    systolic_bp      : 120,
    diastolic_bp     : 80,
  };
}

async function fetchExplanation(payload, token) {
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || e.message || 'Explanation failed');
  }
  return res.json();
}

// Render SHAP contributions into a container element as diverging bars.
function renderShap(containerEl, explanation, topK = 6) {
  if (!explanation || !Array.isArray(explanation.contributions)) {
    containerEl.innerHTML = '<div class="shap-error">No explanation available.</div>';
    return;
  }

  const contribs = explanation.contributions
    .filter(c => Math.abs(c.shap) > 0)
    .slice(0, topK);

  if (!contribs.length) {
    containerEl.innerHTML =
      '<div class="shap-panel"><div class="shap-note">All features had a negligible effect on this prediction.</div></div>';
    return;
  }

  const maxAbs = Math.max(...contribs.map(c => Math.abs(c.shap))) || 1;

  const pred = explanation.prediction || '';
  const prob = (typeof explanation.probability_high_risk === 'number')
    ? Math.round(explanation.probability_high_risk * 100) + '%'
    : null;

  const rows = contribs.map(c => {
    const meta = SHAP_FEATURE_META[c.feature] || { label: c.feature, icon: '•', unit: '' };
    const pct = (Math.abs(c.shap) / maxAbs) * 50; // half-width is the max
    const up = c.shap > 0;
    const valStr = c.value != null ? `${c.value}${meta.unit ? ' ' + meta.unit : ''}` : '';
    return `
      <div class="shap-row">
        <div class="shap-row-head">
          <span class="shap-feat">${meta.icon} ${meta.label}</span>
          <span class="shap-val">${valStr} · ${up ? '+' : ''}${c.shap}</span>
        </div>
        <div class="shap-track">
          <div class="shap-bar ${up ? 'up' : 'down'}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  containerEl.innerHTML = `
    <div class="shap-panel">
      <div class="shap-title">🧠 Why this risk level? (SHAP)</div>
      <div class="shap-pred">
        Model prediction: <strong>${pred || '—'}</strong>${prob ? ` · ${prob} risk probability` : ''}
      </div>
      <div class="shap-legend">
        <span><span class="dot up"></span>Increases risk</span>
        <span><span class="dot down"></span>Decreases risk</span>
      </div>
      ${rows}
      <div class="shap-note">${explanation.model_used || 'Model'} · features ranked by impact on the risk score.</div>
    </div>`;
}
