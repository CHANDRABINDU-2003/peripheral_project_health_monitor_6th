/* ========================================
   report.js — Patient Monitoring System
   ======================================== */

const API_BASE = '/api';
let fallDetectedValue = false;

// ── Auth Guard ────────────────────────────
function logout() {
  localStorage.removeItem('patient');
  localStorage.removeItem('token');
  window.location.href = 'login.html';
}

// ── Helpers ──────────────────────────────
function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = (icons[type] || 'ℹ️') + ' ' + msg;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300); }, 3500);
}

function setAlert(id, html, type) {
  const el = document.getElementById(id);
  if (!html) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="alert alert-${type}">${html}</div>`;
}

function showFieldError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (err)   { err.textContent = msg; err.classList.add('visible'); }
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  if (input) input.classList.remove('error');
  if (err)   err.classList.remove('visible');
}

// ── Fall Toggle ───────────────────────────
function setFall(val) {
  fallDetectedValue = val;
  document.getElementById('fallDetected').value = val;
  const yesBtn = document.getElementById('fallYes');
  const noBtn  = document.getElementById('fallNo');
  yesBtn.className = 'toggle-opt' + (val ? ' active-yes' : '');
  noBtn.className  = 'toggle-opt' + (!val ? ' active-no' : '');
}

// ── Set default timestamp ─────────────────
function setDefaultTime() {
  const now = new Date();
  // Format to datetime-local value: YYYY-MM-DDTHH:MM
  const local = new Date(now - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  document.getElementById('reportTime').value = local;
}

// ── Validate ──────────────────────────────
function validateForm() {
  let valid = true;
  clearFieldError('heartRate',   'hrError');
  clearFieldError('temperature', 'tempError');
  clearFieldError('oxygen',      'spo2Error');
  setAlert('formAlert', '', '');

  const hr   = parseFloat(document.getElementById('heartRate').value);
  const temp = parseFloat(document.getElementById('temperature').value);
  const spo2 = parseFloat(document.getElementById('oxygen').value);

  if (isNaN(hr) || hr < 20 || hr > 250) {
    showFieldError('heartRate', 'hrError', 'Enter a valid heart rate (20–250 bpm).');
    valid = false;
  }
  if (isNaN(temp) || temp < 90 || temp > 115) {
    showFieldError('temperature', 'tempError', 'Enter a valid temperature (90–115°F).');
    valid = false;
  }
  if (isNaN(spo2) || spo2 < 50 || spo2 > 100) {
    showFieldError('oxygen', 'spo2Error', 'Enter a valid SpO₂ value (50–100%).');
    valid = false;
  }
  return valid;
}

// ── 10 granular risk levels (mirrors backend utils/riskScore.js) ─────────
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

// ── Risk Score (0–100) — mirrors backend utils/riskScore.js ──────
function computeRiskScore({ heart_rate, temperature, oxygen, fall_detected }) {
  const hr = parseFloat(heart_rate), temp = parseFloat(temperature), spo2 = parseFloat(oxygen);
  let pts = 0;
  // Heart rate
  if (!isNaN(hr)) {
    if (hr >= 130 || hr <= 35) pts += 38;
    else if (hr >= 120 || hr <= 40) pts += 33;
    else if (hr >= 110 || hr <= 45) pts += 25;
    else if (hr >= 101 || hr <= 50) pts += 15;
    else if (hr >= 91  || hr <= 55) pts += 6;
  }
  // Temperature
  if (!isNaN(temp)) {
    if (temp >= 105 || temp <= 93) pts += 35;
    else if (temp >= 104) pts += 30;
    else if (temp >= 103) pts += 26;
    else if (temp >= 102) pts += 24;
    else if (temp >= 101) pts += 22;
    else if (temp >= 100.4) pts += 16;
    else if (temp >= 99.5) pts += 8;
    else if (temp <= 95) pts += 30;
  }
  // Oxygen
  if (!isNaN(spo2)) {
    if (spo2 < 85) pts += 45;
    else if (spo2 < 88) pts += 38;
    else if (spo2 < 90) pts += 35;
    else if (spo2 < 92) pts += 33;
    else if (spo2 < 94) pts += 20;
    else if (spo2 < 95) pts += 10;
  }
  if (fall_detected) pts += 20;

  const score = Math.min(100, Math.max(0, Math.round(pts)));
  const lvl = getRiskLevel(score);
  return { score, level: lvl.level, color: lvl.color, tips: lvl.tips };
}

function renderRiskScore(score) {
  const lvl = getRiskLevel(score);
  const box = document.getElementById('riskScoreBox');
  box.style.display = '';
  document.getElementById('riskScoreNum').textContent = score;

  const bandEl = document.getElementById('riskScoreBand');
  bandEl.textContent = lvl.level;
  bandEl.style.background = lvl.color;

  const fill = document.getElementById('riskScoreFill');
  fill.style.width = score + '%';
  fill.style.background = lvl.color;

  // Health tips for this level
  const tipsEl = document.getElementById('riskTips');
  tipsEl.innerHTML = lvl.tips.map((t, i) => `
    <div class="tip-card" style="border-left-color:${lvl.color}">
      <div class="tip-title">Tip ${i + 1}</div>
      <div class="tip-line">${t[0]}</div>
      <div class="tip-line">${t[1]}</div>
    </div>`).join('');
}

// ── Local prediction (used when backend can't save) ──────────────
function localPredict({ heart_rate: hr, temperature: temp, oxygen: spo2, fall_detected: fall }) {
  let prediction, recommendation;
  if (fall || spo2 < 90 || hr > 130 || temp > 103) {
    prediction     = 'Emergency';
    recommendation = 'Critical values detected. Please seek immediate medical attention. Call emergency services if necessary.';
  } else if (spo2 < 94 || hr > 100 || hr < 55 || temp > 100.4 || temp < 97) {
    prediction     = 'Warning';
    recommendation = 'Some readings are outside the normal range. Rest, stay hydrated, and consult your physician if symptoms persist.';
  } else {
    prediction     = 'Normal';
    recommendation = 'All vitals are within the healthy range. Maintain your current habits — stay active, hydrated, and get adequate sleep.';
  }
  return { prediction, recommendation };
}

// ── Update Result Panel ───────────────────
function updateResultPanel(prediction, recommendation, formData, riskInfo) {
  const display = document.getElementById('riskDisplay');
  const label   = document.getElementById('riskLabel');
  const sub     = document.getElementById('riskSub');
  const iconEl  = display.querySelector('.risk-icon');

  display.className = 'risk-display';

  const risk = (prediction || '').toLowerCase();
  if (risk === 'normal') {
    display.classList.add('normal');
    iconEl.textContent  = '✅';
    label.textContent   = 'Normal';
    sub.textContent     = 'All vitals within healthy range.';
  } else if (risk === 'warning') {
    display.classList.add('warning');
    iconEl.textContent  = '⚠️';
    label.textContent   = 'Warning';
    sub.textContent     = 'Some readings require attention.';
  } else if (risk === 'emergency') {
    display.classList.add('emergency');
    iconEl.textContent  = '🚨';
    label.textContent   = 'Emergency';
    sub.textContent     = 'Critical values detected — seek help immediately!';
  } else {
    display.classList.add('pending');
    iconEl.textContent = '🩺';
    label.textContent  = prediction || 'Unknown';
    sub.textContent    = '';
  }

  // Risk score (use backend score if provided, else compute locally).
  // Level + tips are always derived from the score on the client.
  const score = riskInfo && typeof riskInfo.score === 'number'
    ? riskInfo.score : computeRiskScore(formData).score;
  renderRiskScore(score);

  // Vitals summary
  const vs = document.getElementById('vitalsSummary');
  vs.style.display = '';
  document.getElementById('resHR').textContent   = formData.heart_rate + ' bpm';
  document.getElementById('resTemp').textContent = formData.temperature + ' °F';
  document.getElementById('resSpo2').textContent = formData.oxygen + ' %';
  document.getElementById('resFall').textContent = formData.fall_detected ? 'Yes' : 'No';

  // Recommendation
  const reco = document.getElementById('recoBox');
  reco.style.display = '';
  document.getElementById('recoText').textContent = recommendation || 'No recommendation available.';

  // Saved note
  document.getElementById('savedNote').style.display = '';

  // SHAP explanation — why the model assigned this risk level
  loadExplanation(formData);
}

// ── SHAP feature-contribution explanation ─────────────────
async function loadExplanation(formData) {
  const box = document.getElementById('shapBox');
  if (!box) return;
  const token = localStorage.getItem('token');
  if (!token || typeof fetchExplanation !== 'function') { box.innerHTML = ''; return; }

  box.innerHTML = '<div class="shap-note">🧠 Generating explanation…</div>';
  try {
    const patient = JSON.parse(localStorage.getItem('patient') || '{}');
    // formData.temperature is °F; buildExplainPayload converts it to °C for the model.
    const payload = buildExplainPayload(formData, patient);
    const explanation = await fetchExplanation(payload, token);
    renderShap(box, explanation);
  } catch (err) {
    console.error('SHAP explanation failed:', err);
    box.innerHTML = '';   // stay quiet if the explanation service is unavailable
  }
}

// ── Reset Form ────────────────────────────
function resetForm() {
  document.getElementById('reportForm').reset();
  setFall(false);
  setDefaultTime();
  setAlert('formAlert', '', '');
  ['heartRate','temperature','oxygen'].forEach(id => {
    document.getElementById(id).classList.remove('error');
  });
  ['hrError','tempError','spo2Error'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });

  // Reset result panel
  const display = document.getElementById('riskDisplay');
  display.className = 'risk-display pending';
  display.querySelector('.risk-icon').textContent = '🩺';
  document.getElementById('riskLabel').textContent = 'Awaiting Input';
  document.getElementById('riskSub').textContent   = 'Submit your vitals to get a prediction';
  document.getElementById('riskScoreBox').style.display   = 'none';
  document.getElementById('vitalsSummary').style.display = 'none';
  document.getElementById('recoBox').style.display        = 'none';
  document.getElementById('savedNote').style.display      = 'none';
  const shapBox = document.getElementById('shapBox');
  if (shapBox) shapBox.innerHTML = '';
}

// ── Submit ────────────────────────────────
document.getElementById('reportForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!validateForm()) return;

  const patient = JSON.parse(localStorage.getItem('patient') || 'null');
  const token   = localStorage.getItem('token');
  if (!patient || !token) { window.location.href = 'login.html'; return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analysing...';
  document.getElementById('loadingOverlay').classList.add('show');
  setAlert('formAlert', '', '');

  const formData = {
    heart_rate:    parseFloat(document.getElementById('heartRate').value),
    temperature:   parseFloat(document.getElementById('temperature').value),
    oxygen:        parseFloat(document.getElementById('oxygen').value),
    fall_detected: fallDetectedValue,
    recorded_at:   document.getElementById('reportTime').value || new Date().toISOString(),
  };

  try {
    const res = await fetch(`${API_BASE}/report/generate`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(formData)
    });

    const data = await res.json();

    if (!res.ok) {
      // Backend is reachable but couldn't save (e.g. database not connected).
      // Still show a prediction + risk score so the user always gets a result.
      const msg = data.message || data.error || 'Could not save the report to the server.';
      setAlert('formAlert', '⚠️ ' + msg + ' Showing an unsaved result below.', 'warning');
      showToast('Report not saved — showing unsaved result.', 'warning');
      const local = localPredict(formData);
      updateResultPanel(local.prediction, local.recommendation, formData);
      return;
    }

    showToast('Report generated and saved!', 'success');
    updateResultPanel(data.prediction, data.recommendation, formData, {
      score: data.risk_score, band: data.risk_band, color: data.risk_color
    });

  } catch (err) {
    console.error(err);
    // ── Demo mode (no backend connection at all) ──────
    showToast('Report generated (demo mode — backend not connected).', 'warning');
    const local = localPredict(formData);
    updateResultPanel(local.prediction, local.recommendation, formData);
  } finally {
    document.getElementById('loadingOverlay').classList.remove('show');
    btn.disabled = false;
    btn.innerHTML = 'Generate Report &amp; Predict Risk';
  }
});

// ── Live input error clearing ─────────────
[['heartRate','hrError'], ['temperature','tempError'], ['oxygen','spo2Error']].forEach(([inp, err]) => {
  document.getElementById(inp).addEventListener('input', () => clearFieldError(inp, err));
});

// ── Init ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  const patient = JSON.parse(localStorage.getItem('patient') || 'null');
  const token   = localStorage.getItem('token');
  if (!patient || !token) { window.location.href = 'login.html'; return; }

  const initials = patient.name
    ? patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  document.getElementById('navAvatar').textContent = initials;

  setDefaultTime();
  setFall(false);
});
