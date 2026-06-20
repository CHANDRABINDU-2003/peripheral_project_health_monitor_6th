const express = require('express');
const router = express.Router();
const {
  getCurrentCondition,
  getHistory,
  getHealthInsights,
  getEmergencyContacts,
  saveEmergencyContacts
} = require('../controllers/patientController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/current - Get patient's current/latest condition
router.get('/current', verifyToken, getCurrentCondition);

// GET /api/history - Get patient's previous health history
router.get('/history', verifyToken, getHistory);

// GET /api/patient/health-insights - This month's health analytics
router.get('/patient/health-insights', verifyToken, getHealthInsights);

// Emergency contacts (family/friends) — GET to read, PUT to replace (max 2)
router.get('/patient/emergency-contacts', verifyToken, getEmergencyContacts);
router.put('/patient/emergency-contacts', verifyToken, saveEmergencyContacts);

module.exports = router;
