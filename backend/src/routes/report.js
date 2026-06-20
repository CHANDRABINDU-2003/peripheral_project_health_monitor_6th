const express = require('express');
const router = express.Router();
const { createReport, getTodayReport } = require('../controllers/reportController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/report - Submit new health report (triggers ML prediction)
router.post('/report', verifyToken, createReport);

// GET /api/report/today - Get today's report
router.get('/report/today', verifyToken, getTodayReport);

module.exports = router;
