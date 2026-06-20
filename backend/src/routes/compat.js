/**
 * compat.js — bridges the frontend's API paths to the existing controllers.
 * The frontend was built against a slightly different contract; these aliases
 * connect the two without touching the frontend code.
 */
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { register, login } = require('../controllers/authController');
const { createReport } = require('../controllers/reportController');

const prisma = require('../config/prisma');

// ── Auth (frontend calls /api/auth/*) ──────────────────────────────
router.post('/auth/register', (req, res) => {
  // Frontend validates confirm client-side and doesn't send confirmPassword;
  // the register controller requires it, so mirror it here.
  if (req.body.confirmPassword === undefined) req.body.confirmPassword = req.body.password;
  return register(req, res);
});
router.post('/auth/login', login);

// ── Report (frontend calls /api/report/generate) ───────────────────
router.post('/report/generate', verifyToken, createReport);

// ── Latest report as a FLAT object; 404 when none (frontend throws on !ok) ──
router.get('/patient/latest-report', verifyToken, async (req, res) => {
  try {
    const report = await prisma.healthReport.findFirst({
      where: { patient_id: req.patient.patient_id },
      orderBy: { created_at: 'desc' }
    });
    if (!report) return res.status(404).json({ error: 'No reports yet.' });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch latest report.' });
  }
});

// ── All reports as a plain ARRAY (frontend expects an array) ───────
router.get('/patient/reports', verifyToken, async (req, res) => {
  try {
    const reports = await prisma.healthReport.findMany({
      where: { patient_id: req.patient.patient_id },
      orderBy: { created_at: 'desc' }
    });
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

module.exports = router;
