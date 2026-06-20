/* ========================================
   dashboard.js — Patient Monitoring System
   ======================================== */

const API_BASE = '/api';

function logout() {
  localStorage.removeItem('patient');
  localStorage.removeItem('token');
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

function calcBMI(weight, height) {
  if (!weight || !height) return '—';
  return (weight / Math.pow(height / 100, 2)).toFixed(1);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function applyStatusPill(risk) {
  const el = document.getElementById('stripStatus');
  const cls = !risk ? 'pill-healthy'
    : risk.toLowerCase() === 'warning' ? 'pill-warning'
    : risk.toLowerCase() === 'emergency' ? 'pill-danger'
    : 'pill-healthy';
  const dotCls = !risk || risk.toLowerCase() === 'normal' ? 'pulse-green'
    : risk.toLowerCase() === 'warning' ? 'pulse-amber'
    : 'pulse-red';
  const label = !risk || risk.toLowerCase() === 'normal' ? 'Healthy'
    : risk.toLowerCase() === 'warning' ? 'Warning'
    : 'Emergency';
  el.innerHTML = `<span class="status-pill ${cls}"><span class="pulse-dot ${dotCls}"></span>${label}</span>`;
}

async function loadDashboard() {
  const patient = JSON.parse(localStorage.getItem('patient') || 'null');
  const token   = localStorage.getItem('token');

  if (!patient || !token) {
    window.location.href = 'login.html';
    return;
  }

  // Greet
  const firstName = (patient.name || 'Patient').split(' ')[0];
  document.getElementById('welcomeHeading').textContent = `${getGreeting()}, ${firstName}`;

  // Navbar
  const initials = patient.name
    ? patient.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  document.getElementById('navAvatar').textContent = initials;
  document.getElementById('navName').textContent   = patient.name || '';

  // Summary strip
  document.getElementById('stripName').textContent = patient.name || '—';
  document.getElementById('stripAge').textContent  = patient.age ? patient.age + ' yrs' : '—';
  document.getElementById('stripBMI').textContent  = calcBMI(patient.weight, patient.height);

  // Fetch latest report
  try {
    const res = await fetch(`${API_BASE}/patient/latest-report`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) throw new Error('No report');
    const report = await res.json();

    // Quick vitals
    document.getElementById('qHR').textContent   = report.heart_rate  ? report.heart_rate  + ' bpm' : '—';
    document.getElementById('qTemp').textContent = report.temperature ? report.temperature  + ' °F'  : '—';
    document.getElementById('qSpo2').textContent = report.oxygen      ? report.oxygen       + '%'    : '—';
    document.getElementById('qRisk').textContent = report.prediction  || '—';
    document.getElementById('qFall').textContent = report.fall_detected ? 'Yes' : 'No';

    const d = new Date(report.created_at);
    document.getElementById('lastReportTime').textContent = 'Last updated: ' + d.toLocaleString();

    applyStatusPill(report.prediction);

  } catch {
    // No reports yet — show defaults
    document.getElementById('qHR').textContent   = '—';
    document.getElementById('qTemp').textContent = '—';
    document.getElementById('qSpo2').textContent = '—';
    document.getElementById('qRisk').textContent = 'No data';
    document.getElementById('qFall').textContent = '—';
    document.getElementById('lastReportTime').textContent = 'No reports submitted yet';
    applyStatusPill(null);
  }
}

/* ── 30-day trend charts ───────────────────────────────────────────── */

function makeLineChart(canvasId, wrapId, points, color, unit) {
  const wrap = document.getElementById(wrapId);
  if (!points.length) {
    wrap.innerHTML = '<div class="chart-empty">No readings in the last 30 days.</div>';
    return;
  }
  const labels = points.map(p => {
    const d = new Date(p.t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  });
  const data = points.map(p => p.v);

  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: points.length > 20 ? 0 : 3,
        pointBackgroundColor: color,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => c.parsed.y + ' ' + unit }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: 'rgba(26,58,92,0.06)' }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

async function loadTrends() {
  if (typeof Chart === 'undefined') return;
  const token = localStorage.getItem('token');
  if (!token) return;

  let reports = [];
  try {
    const res = await fetch(`${API_BASE}/patient/reports`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) reports = await res.json();
  } catch { /* leave empty → charts show empty state */ }

  // Keep only the last 30 days, oldest → newest for the x-axis
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = (reports || [])
    .filter(r => new Date(r.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const hr   = recent.filter(r => r.heart_rate  != null).map(r => ({ t: r.created_at, v: parseFloat(r.heart_rate) }));
  const temp = recent.filter(r => r.temperature != null).map(r => ({ t: r.created_at, v: parseFloat(r.temperature) }));
  const spo2 = recent.filter(r => r.oxygen      != null).map(r => ({ t: r.created_at, v: parseFloat(r.oxygen) }));

  makeLineChart('chartHR',   'wrapHR',   hr,   '#C9447A', 'bpm');
  makeLineChart('chartTemp', 'wrapTemp', temp, '#D98E04', '°F');
  makeLineChart('chartSpo2', 'wrapSpo2', spo2, '#2563A8', '%');
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadTrends();
});
