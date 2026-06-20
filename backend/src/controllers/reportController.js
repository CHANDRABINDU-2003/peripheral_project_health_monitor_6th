const { runPrediction } = require('../routes/prediction');
const { computeRiskScore } = require('../utils/riskScore');
const prisma = require('../config/prisma');

// POST /api/report — Create new report and run ML prediction
const createReport = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const {
      heart_rate, temperature, oxygen, fall_detected,
      respiratory_rate, systolic_bp, diastolic_bp, time
    } = req.body;

    if (!heart_rate || !temperature || !oxygen) {
      return res.status(400).json({ error: 'heart_rate, temperature, and oxygen are required.' });
    }

    const hr   = parseFloat(heart_rate);
    const temp = parseFloat(temperature);
    const spo2 = parseFloat(oxygen);

    if (hr < 20 || hr > 300)    return res.status(400).json({ error: 'Invalid heart rate (20–300 bpm).' });
    if (temp < 90 || temp > 115) return res.status(400).json({ error: 'Invalid temperature (90–115°F).' });
    if (spo2 < 50 || spo2 > 100) return res.status(400).json({ error: 'Invalid SpO₂ (50–100%).' });

    // Get patient info (needed for ML features)
    const patient = await prisma.patient.findUnique({
      where: { patient_id },
      select: { age: true, gender: true, weight: true, height: true }
    });

    // Build full ML payload — your model uses 14 features
    const mlPayload = {
      heart_rate    : hr,
      temperature   : temp,
      oxygen        : spo2,
      fall_detected : fall_detected === true || fall_detected === 'true' || fall_detected === 1,
      age           : patient.age,
      gender        : patient.gender === 'Male' ? 1 : 0,
      weight_kg     : patient.weight,
      height_cm     : patient.height,          // stored in cm in DB
      respiratory_rate : parseFloat(respiratory_rate) || 16,
      systolic_bp      : parseFloat(systolic_bp)  || 120,
      diastolic_bp     : parseFloat(diastolic_bp) || 80,
    };

    const predictionResult = await runPrediction(mlPayload);

    // Compute a 0–100 risk score from the vitals
    const risk = computeRiskScore({
      heart_rate: hr, temperature: temp, oxygen: spo2,
      fall_detected: mlPayload.fall_detected
    });

    const report = await prisma.healthReport.create({
      data: {
        patient_id,
        heart_rate : hr,
        temperature: temp,
        oxygen     : spo2,
        fall_detected: mlPayload.fall_detected,
        prediction   : predictionResult.prediction,
        recommendation: predictionResult.recommendation,
        source       : req.device ? 'device' : 'manual',      // where the vitals came from
        device_id    : req.device ? req.device.device_id : null,
        created_at : time ? new Date(time) : new Date()
      }
    });

    res.status(201).json({
      message       : 'Report created successfully.',
      report_id     : report.report_id,
      prediction    : predictionResult.prediction,
      recommendation: predictionResult.recommendation,
      probability_high_risk: predictionResult.probability_high_risk,
      model_used    : predictionResult.model_used,
      reasons       : predictionResult.reasons,
      risk_score    : risk.score,
      risk_band     : risk.band,
      risk_level    : risk.level,
      risk_color    : risk.color,
      risk_tips     : risk.tips,
      risk_breakdown: risk.breakdown,
      report
    });

  } catch (error) {
    console.error('createReport error:', error);
    res.status(500).json({ error: 'Failed to create report.', message: error.message });
  }
};

// GET /api/report/today
const getTodayReport = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay   = new Date(); endOfDay.setHours(23,59,59,999);

    const reports = await prisma.healthReport.findMany({
      where: { patient_id, created_at: { gte: startOfDay, lte: endOfDay } },
      orderBy: { created_at: 'desc' }
    });

    res.json({ date: startOfDay.toISOString().split('T')[0], reports, count: reports.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch today\'s report.' });
  }
};

module.exports = { createReport, getTodayReport };
