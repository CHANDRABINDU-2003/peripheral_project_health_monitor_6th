/* ========================================
   doctor-dashboard.js — Patient Monitoring System
   Shows the whole patient dataset to the doctor.
   ======================================== */

const API_BASE = '/api';
let allPatients = [];
let renderedList = [];   // the list currently shown (after search filtering)

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('doctor');
  localStorage.removeItem('patient');
  window.location.href = 'login.html';
}

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = (icons[type] || 'ℹ️') + ' ' + msg;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300); }, 3500);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(name) {
  return name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
}

function colorFor(score) {
  // Bands: Low 0–33 · High 34–66 · Emergency 67–100
  if (score >= 67) return '#991B1B';
  if (score >= 34) return '#D98E04';
  return '#0E9F6E';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Render ────────────────────────────────
function renderReportsTable(reports) {
  if (!reports || !reports.length) {
    return '<div class="no-reports">No reports submitted yet.</div>';
  }
  const rows = reports.map(r => {
    const score = r.risk_score;
    const pred = esc(r.prediction || '—');
    return `
      <tr>
        <td>${fmtDate(r.created_at)}</td>
        <td>${r.heart_rate ?? '—'} bpm</td>
        <td>${r.temperature ?? '—'} °F</td>
        <td>${r.oxygen ?? '—'} %</td>
        <td>${r.fall_detected ? 'Yes' : 'No'}</td>
        <td><span class="pred-tag pred-${pred}">${pred}</span></td>
        <td><span class="score-pill" style="background:${colorFor(score)}">${score}/100</span></td>
      </tr>`;
  }).join('');

  return `
    <table class="reports-table">
      <thead>
        <tr>
          <th>Date</th><th>Heart Rate</th><th>Temp</th><th>SpO₂</th>
          <th>Fall</th><th>Prediction</th><th>Risk Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Section sub-label used inside an expanded patient card
function sectionLabel(text) {
  return `<div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--slate); margin-bottom:0.5rem; font-weight:700;">${text}</div>`;
}

// Emergency contacts block (blank-friendly when none are provided)
function renderEmergencyContacts(contacts) {
  const list = contacts || [];
  const cards = list.length
    ? `<div class="ec-cards">${list.map(c => `
        <div class="ec-card">
          <div class="ec-name">${esc(c.name)}</div>
          <div class="ec-rel">${esc(c.relationship || 'Emergency contact')}</div>
          <div class="ec-phone">📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>
        </div>`).join('')}</div>`
    : '<div class="ec-empty">No emergency contacts provided.</div>';
  return `<div class="ec-block">${sectionLabel('🆘 Emergency Contacts')}${cards}</div>`;
}

function renderPatients(list) {
  const container = document.getElementById('patientList');
  renderedList = list;

  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div>No patients found.</div>';
    return;
  }

  container.innerHTML = list.map((p, idx) => {
    const latest = p.latest_report;
    const badge = latest
      ? `<span class="risk-badge" style="background:${colorFor(latest.risk_score)}">
           <span class="rb-score">${latest.risk_score}/100</span> ${esc(latest.risk_band)}
         </span>`
      : `<span class="risk-badge no-data">No reports</span>`;

    return `
      <div class="patient-card" id="pc-${idx}">
        <div class="patient-head" onclick="toggleCard(${idx})">
          <div class="patient-avatar">${esc(initials(p.name))}</div>
          <div>
            <div class="patient-name">${esc(p.name)}</div>
            <div class="patient-sub">${esc(p.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
          </div>
          <div class="patient-meta hide-sm">
            <div class="m-label">Age / Gender</div>
            <div class="m-value">${esc(p.age)} · ${esc(p.gender)}</div>
          </div>
          <div class="patient-meta hide-sm">
            <div class="m-label">Reports</div>
            <div class="m-value">${p.report_count}</div>
          </div>
          <div style="display:flex; align-items:center; gap:0.9rem;">
            ${badge}
            <span class="expand-arrow">▶</span>
          </div>
        </div>
        <div class="patient-reports">
          ${renderEmergencyContacts(p.emergency_contacts)}

          ${sectionLabel(`Health Reports · BMI ${p.bmi ?? '—'} · ${esc(p.height)}cm / ${esc(p.weight)}kg`)}
          ${renderReportsTable(p.reports)}

          ${latest ? `
          <div class="shap-block">
            <button class="shap-btn" onclick="explainPatient(${idx})" id="shapBtn-${idx}">
              🧠 Explain latest risk (SHAP)
            </button>
            <div id="shapBox-${idx}"></div>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function toggleCard(idx) {
  document.getElementById('pc-' + idx).classList.toggle('open');
}

// Fetch + render the SHAP explanation for a patient's latest report
async function explainPatient(idx) {
  const p = renderedList[idx];
  if (!p || !p.latest_report) return;

  const btn = document.getElementById('shapBtn-' + idx);
  const box = document.getElementById('shapBox-' + idx);
  const token = localStorage.getItem('token');

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '⏳ Analysing...';
  box.innerHTML = '';

  try {
    const payload = buildExplainPayload(p.latest_report, {
      age: p.age, gender: p.gender, weight: p.weight, height: p.height
    });
    const explanation = await fetchExplanation(payload, token);
    renderShap(box, explanation);
    btn.style.display = 'none';
  } catch (err) {
    console.error(err);
    box.innerHTML = '<div class="shap-error">Could not load explanation. ' + esc(err.message) + '</div>';
    btn.disabled = false;
    btn.textContent = original;
  }
}

function applySearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!q) return renderPatients(allPatients);
  const filtered = allPatients.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.email || '').toLowerCase().includes(q)
  );
  renderPatients(filtered);
}

// ── Load ──────────────────────────────────
async function loadDoctorDashboard() {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');

  if (!token || role !== 'doctor') {
    window.location.href = 'login.html';
    return;
  }

  const doctor = JSON.parse(localStorage.getItem('doctor') || '{}');
  document.getElementById('navName').textContent = doctor.name || 'Doctor';
  document.getElementById('navAvatar').textContent = initials(doctor.name || 'Dr');

  try {
    const res = await fetch(`${API_BASE}/doctor/patients`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.status === 401 || res.status === 403) {
      showToast('Session expired. Please log in again.', 'error');
      setTimeout(logout, 1200);
      return;
    }
    if (!res.ok) throw new Error('Request failed');

    const data = await res.json();
    allPatients = data.patients || [];

    document.getElementById('statPatients').textContent = data.total_patients ?? allPatients.length;
    document.getElementById('statReports').textContent  = data.total_reports ?? '—';
    document.getElementById('statAtRisk').textContent   = data.at_risk ?? '—';

    renderPatients(allPatients);
  } catch (err) {
    console.error(err);
    document.getElementById('patientList').innerHTML =
      '<div class="empty-state"><div class="es-icon">⚠️</div>Could not load patients. Is the server running?</div>';
    showToast('Failed to load patient data.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDoctorDashboard();
  document.getElementById('searchInput').addEventListener('input', applySearch);
});
