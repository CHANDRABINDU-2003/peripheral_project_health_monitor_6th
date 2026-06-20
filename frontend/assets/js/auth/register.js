/* ========================================
   register.js — Patient Monitoring System
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

function showError(id, msg) {
  const el = document.getElementById(id);
  const inp = document.getElementById(id.replace('Error', '')) ||
              document.getElementById(id.replace('Error', 's').replace(/^reg/, 'reg'));
  if (el) { el.textContent = msg; el.classList.add('visible'); }
  const inputEl = document.querySelector(`#${id.replace('Error','')}`);
  if (inputEl) inputEl.classList.add('error');
}

function clearErrors(...ids) {
  ids.forEach(id => {
    const errEl = document.getElementById(id + 'Error');
    const inpEl = document.getElementById(id);
    if (errEl) errEl.classList.remove('visible');
    if (inpEl) inpEl.classList.remove('error');
  });
}

// ── Step navigation ───────────────────────
let currentStep = 1;

function updateStepIndicator() {
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('dot' + i);
    dot.classList.remove('active', 'done');
    if (i < currentStep)  dot.classList.add('done');
    if (i === currentStep) dot.classList.add('active');
  }
}

function showStep(n) {
  for (let i = 1; i <= 3; i++) {
    document.getElementById('step' + i).style.display = (i === n) ? '' : 'none';
  }
  currentStep = n;
  updateStepIndicator();
  setAlert('registerAlert', '', '');
}

// ── Step 1 validation ─────────────────────
function validateStep1() {
  clearErrors('fullName', 'age', 'gender', 'weight', 'height');
  let valid = true;

  const name   = document.getElementById('fullName').value.trim();
  const age    = parseInt(document.getElementById('age').value);
  const gender = document.getElementById('gender').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const height = parseFloat(document.getElementById('height').value);

  if (!name || name.length < 2) {
    showError('fullNameError', 'Please enter your full name (at least 2 characters).');
    valid = false;
  }
  if (isNaN(age) || age < 1 || age > 120) {
    showError('ageError', 'Enter a valid age between 1 and 120.');
    valid = false;
  }
  if (!gender) {
    showError('genderError', 'Please select your gender.');
    valid = false;
  }
  if (isNaN(weight) || weight < 1 || weight > 500) {
    showError('weightError', 'Enter a valid weight (1–500 kg).');
    valid = false;
  }
  if (isNaN(height) || height < 50 || height > 300) {
    showError('heightError', 'Enter a valid height (50–300 cm).');
    valid = false;
  }
  return valid;
}

// ── Step 2 validation ─────────────────────
function validateStep2() {
  clearErrors('address', 'phone');
  let valid = true;

  const address = document.getElementById('address').value.trim();
  const phone   = document.getElementById('phone').value.trim();

  if (!address || address.length < 5) {
    showError('addressError', 'Please enter your full address.');
    valid = false;
  }
  if (!phone || phone.length < 6) {
    showError('phoneError', 'Please enter a valid phone number.');
    valid = false;
  }
  return valid;
}

// ── Step 3 validation ─────────────────────
function validateStep3() {
  clearErrors('regEmail', 'regPassword', 'confirmPassword');
  let valid = true;

  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('confirmPassword').value;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('regEmailError', 'Please enter a valid email address.');
    valid = false;
  }
  if (!password || password.length < 8) {
    showError('regPasswordError', 'Password must be at least 8 characters.');
    valid = false;
  }
  if (password !== confirm) {
    showError('confirmPasswordError', 'Passwords do not match.');
    valid = false;
  }
  return valid;
}

// ── Exposed step functions ────────────────
function nextStep(from) {
  if (from === 1 && !validateStep1()) return;
  if (from === 2 && !validateStep2()) return;
  showStep(from + 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep(from) {
  showStep(from - 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Password toggles ─────────────────────
function setupToggle(toggleId, inputId) {
  document.getElementById(toggleId).addEventListener('click', function () {
    const pw = document.getElementById(inputId);
    const hidden = pw.type === 'password';
    pw.type = hidden ? 'text' : 'password';
    this.textContent = hidden ? '🙈' : '👁';
  });
}
setupToggle('toggleRegPass',     'regPassword');
setupToggle('toggleConfirmPass', 'confirmPassword');

// ── Form Submit ───────────────────────────
document.getElementById('registerForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  setAlert('registerAlert', '', '');

  if (!validateStep3()) return;

  const btn = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account...';

  const payload = {
    name:     document.getElementById('fullName').value.trim(),
    age:      parseInt(document.getElementById('age').value),
    gender:   document.getElementById('gender').value,
    weight:   parseFloat(document.getElementById('weight').value),
    height:   parseFloat(document.getElementById('height').value),
    address:  document.getElementById('address').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    email:    document.getElementById('regEmail').value.trim(),
    password: document.getElementById('regPassword').value,
  };

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.message || data.error || 'Registration failed. Please try again.';
      setAlert('registerAlert', '❌ ' + msg, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create Account';
      return;
    }

    showToast('Account created successfully! Redirecting to login...', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);

  } catch (err) {
    console.error(err);
    setAlert('registerAlert', '🌐 Connection error. Please try again.', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
});

// ── Redirect if already logged in ────────
(function checkAuth() {
  if (localStorage.getItem('token') && localStorage.getItem('patient')) {
    window.location.href = 'dashboard.html';
  }
})();
