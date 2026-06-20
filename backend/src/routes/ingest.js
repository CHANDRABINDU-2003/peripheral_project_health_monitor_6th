const express = require('express');
const router = express.Router();
const { verifyDevice } = require('../middleware/deviceAuth');
const { createReport } = require('../controllers/reportController');

// POST /api/ingest
// Called by an ESP32 / Raspberry Pi. Body is the SAME shape as /api/report:
//   { heart_rate, temperature, oxygen, fall_detected,
//     respiratory_rate?, systolic_bp?, diastolic_bp? }
// Auth is by device key (X-Device-Key header), not a JWT.
// Reuses the exact same createReport logic → ML prediction + saved report.
router.post('/ingest', verifyDevice, createReport);

module.exports = router;
