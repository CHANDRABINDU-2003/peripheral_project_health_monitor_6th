const express = require('express');
const router = express.Router();
const { getAllPatients } = require('../controllers/doctorController');
const { verifyDoctor } = require('../middleware/authMiddleware');

// GET /api/doctor/patients — all patients + reports (doctor only)
router.get('/doctor/patients', verifyDoctor, getAllPatients);

module.exports = router;
