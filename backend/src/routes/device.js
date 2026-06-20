const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const prisma = require('../config/prisma');

// All routes here require a logged-in user (JWT). A device is always created
// for / listed by the patient who is logged in.

// POST /api/devices  → register a new board for the logged-in patient.
// Body: { label?, device_type? }  ("esp32" | "raspberry_pi")
// Returns the api_key ONCE — copy it into your ESP32 sketch.
router.post('/devices', verifyToken, async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const { label, device_type } = req.body;

    const api_key = crypto.randomBytes(24).toString('hex'); // 48-char secret

    const device = await prisma.device.create({
      data: {
        patient_id,
        label: label || null,
        device_type: device_type === 'raspberry_pi' ? 'raspberry_pi' : 'esp32',
        api_key,
      },
    });

    res.status(201).json({
      message: 'Device registered. Copy the api_key into your board — it is shown only once.',
      device_id: device.device_id,
      patient_id: device.patient_id,
      label: device.label,
      device_type: device.device_type,
      api_key, // <-- the passcode the ESP32 sends in X-Device-Key
    });
  } catch (error) {
    console.error('create device error:', error);
    res.status(500).json({ error: 'Failed to register device.' });
  }
});

// GET /api/devices  → list the logged-in patient's boards (no secrets shown).
router.get('/devices', verifyToken, async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      where: { patient_id: req.patient.patient_id },
      select: {
        device_id: true, label: true, device_type: true,
        active: true, last_seen: true, created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
    res.json({ devices, count: devices.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list devices.' });
  }
});

module.exports = router;
