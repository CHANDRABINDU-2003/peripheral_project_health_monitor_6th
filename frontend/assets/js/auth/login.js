/* ========================================
   login.js — Patient Monitoring System
   ======================================== */

const API_BASE = '/api';

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

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || 'Sign In';
  }
}

function validate() {
  let valid = true;
  const email    = document.getElementById('email');
  const password = document.getElementById('password');
  const emailErr = document.getElementById('emailError');
  const passErr  = document.getElementById('passwordError');

  // Reset
  [email, password].forEach(el => el.classList.remove('error'));
  [emailErr, passErr].forEach(el => el.classList.remove('visible'));

  // Email
  if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    email.classList.add('error');
    emailErr.classList.add('visible');
    valid = false;
  }
  // Password
  if (!password.value) {
    password.classList.add('error');
    passErr.classList.add('visible');
    valid = false;
  }
  return valid;
}

// ── Password Toggle ───────────────────────
document.getElementById('togglePassword').addEventListener('click', function () {
  const pw = document.getElementById('password');
  const isHidden = pw.type === 'password';
  pw.type = isHidden ? 'text' : 'password';
  this.textContent = isHidden ? '🙈' : '👁';
});

// ── Forgot Password ───────────────────────
function handleForgotPassword() {
  showToast('Password reset feature coming soon. Please contact your healthcare provider.', 'info');
}

// ── Form Submit ───────────────────────────
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  setAlert('loginAlert', '', '');

  if (!validate()) return;

  const btn = document.getElementById('loginBtn');
  setLoading(btn, true);

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.message || data.error || 'Invalid email or password.';
      setAlert('loginAlert', '🔒 ' + msg, 'error');
      setLoading(btn, false);
      return;
    }

    // ── Doctor session ────────────────────────────────
    if (data.role === 'doctor') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', 'doctor');
      localStorage.setItem('doctor', JSON.stringify(data.doctor || {}));
      localStorage.removeItem('patient');
      showToast('Welcome back, ' + (data.doctor?.name || 'Doctor') + '!', 'success');
      setTimeout(() => { window.location.href = 'doctor-dashboard.html'; }, 800);
      return;
    }

    // ── Patient session ───────────────────────────────
    localStorage.setItem('token',   data.token);
    localStorage.setItem('role',    'patient');
    localStorage.setItem('patient', JSON.stringify(data.patient));
    localStorage.removeItem('doctor');

    showToast('Welcome back, ' + (data.patient?.name || 'Patient') + '!', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);

  } catch (err) {
    console.error(err);
    setAlert('loginAlert', '🌐 Unable to connect. Please check your connection and try again.', 'error');
    setLoading(btn, false);
  }
});

// ── Clear errors on input ─────────────────
['email', 'password'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    this.classList.remove('error');
    const errEl = document.getElementById(id === 'email' ? 'emailError' : 'passwordError');
    if (errEl) errEl.classList.remove('visible');
  });
});

// ── Redirect if already logged in ────────
(function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) return;
  if (localStorage.getItem('role') === 'doctor') {
    window.location.href = 'doctor-dashboard.html';
  } else if (localStorage.getItem('patient')) {
    window.location.href = 'dashboard.html';
  }
})();
