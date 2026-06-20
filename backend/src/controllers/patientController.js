const { computeRiskScore } = require('../utils/riskScore');
const prisma = require('../config/prisma');

// GET /api/current - Latest health report + patient info
const getCurrentCondition = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;

    // Get patient info
    const patient = await prisma.patient.findUnique({
      where: { patient_id },
      select: {
        patient_id: true, name: true, age: true,
        gender: true, height: true, weight: true
      }
    });

    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    // Get latest health report
    const latestReport = await prisma.healthReport.findFirst({
      where: { patient_id },
      orderBy: { created_at: 'desc' }
    });

    // Calculate BMI
    const bmi = (patient.weight / ((patient.height / 100) ** 2)).toFixed(1);

    res.json({
      patient: { ...patient, bmi },
      latest_report: latestReport || null,
      has_report: !!latestReport
    });

  } catch (error) {
    console.error('getCurrentCondition error:', error);
    res.status(500).json({ error: 'Failed to fetch current condition.' });
  }
};

// GET /api/history - All past health reports
const getHistory = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const { limit = 30, offset = 0 } = req.query;

    const reports = await prisma.healthReport.findMany({
      where: { patient_id },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.healthReport.count({ where: { patient_id } });

    res.json({
      reports,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('getHistory error:', error);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
};

// GET /api/patient/health-insights - Analytics for the current calendar month
const getHealthInsights = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    const reports = await prisma.healthReport.findMany({
      where: { patient_id, created_at: { gte: startOfMonth, lt: startOfNextMonth } },
      orderBy: { created_at: 'asc' }
    });

    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    if (reports.length === 0) {
      return res.json({
        month: monthLabel,
        report_count: 0,
        avg_heart_rate: null,
        avg_temperature: null,
        avg_oxygen: null,
        highest_risk: null,
        lowest_risk: null,
        monthly_health_score: null
      });
    }

    const num = (v) => parseFloat(v);
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

    const avgHr   = avg(reports.map(r => num(r.heart_rate)));
    const avgTemp = avg(reports.map(r => num(r.temperature)));
    const avgO2   = avg(reports.map(r => num(r.oxygen)));

    // Score each report and find the most/least risky reading of the month
    const scored = reports.map(r => ({
      created_at: r.created_at,
      score: computeRiskScore({
        heart_rate: r.heart_rate,
        temperature: r.temperature,
        oxygen: r.oxygen,
        fall_detected: r.fall_detected
      }).score
    }));

    let highest = scored[0];
    let lowest = scored[0];
    for (const s of scored) {
      if (s.score > highest.score) highest = s;
      if (s.score < lowest.score)  lowest = s;
    }

    // Monthly health score: 100 = best. Derived from the average risk score.
    const avgRisk = avg(scored.map(s => s.score));
    const monthlyHealthScore = Math.round(100 - avgRisk);

    res.json({
      month: monthLabel,
      report_count: reports.length,
      avg_heart_rate: Math.round(avgHr * 10) / 10,
      avg_temperature: Math.round(avgTemp * 10) / 10,
      avg_oxygen: Math.round(avgO2 * 10) / 10,
      highest_risk: { date: highest.created_at, score: highest.score },
      lowest_risk:  { date: lowest.created_at,  score: lowest.score },
      monthly_health_score: monthlyHealthScore
    });

  } catch (error) {
    console.error('getHealthInsights error:', error);
    res.status(500).json({ error: 'Failed to fetch health insights.' });
  }
};

// GET /api/patient/emergency-contacts - List the patient's emergency contacts
const getEmergencyContacts = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const contacts = await prisma.emergencyContact.findMany({
      where: { patient_id },
      orderBy: { contact_id: 'asc' }
    });
    res.json(contacts);
  } catch (error) {
    console.error('getEmergencyContacts error:', error);
    res.status(500).json({ error: 'Failed to fetch emergency contacts.' });
  }
};

// PUT /api/patient/emergency-contacts - Replace the patient's emergency contacts (max 2)
const saveEmergencyContacts = async (req, res) => {
  try {
    const patient_id = req.patient.patient_id;
    const list = Array.isArray(req.body.contacts) ? req.body.contacts : [];

    // Keep only valid entries (name + phone required), cap at 2
    const cleaned = list
      .map(c => ({
        name: (c.name || '').trim(),
        relationship: (c.relationship || '').trim() || null,
        phone: (c.phone || '').trim()
      }))
      .filter(c => c.name && c.phone)
      .slice(0, 2);

    // Replace existing set atomically
    const saved = await prisma.$transaction(async (tx) => {
      await tx.emergencyContact.deleteMany({ where: { patient_id } });
      if (cleaned.length === 0) return [];
      await tx.emergencyContact.createMany({
        data: cleaned.map(c => ({ ...c, patient_id }))
      });
      return tx.emergencyContact.findMany({
        where: { patient_id },
        orderBy: { contact_id: 'asc' }
      });
    });

    res.json({ message: 'Emergency contacts saved.', contacts: saved });
  } catch (error) {
    console.error('saveEmergencyContacts error:', error);
    res.status(500).json({ error: 'Failed to save emergency contacts.' });
  }
};

module.exports = {
  getCurrentCondition,
  getHistory,
  getHealthInsights,
  getEmergencyContacts,
  saveEmergencyContacts
};
