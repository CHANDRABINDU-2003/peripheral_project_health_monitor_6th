const { computeRiskScore } = require('../utils/riskScore');
const prisma = require('../config/prisma');

// GET /api/doctor/patients — full dataset of patients + their reports (doctor only)
const getAllPatients = async (req, res) => {
  try {
    const patients = await prisma.patient.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        reports: { orderBy: { created_at: 'desc' } },
        emergency_contacts: { orderBy: { contact_id: 'asc' } }
      }
    });

    const data = patients.map((p) => {
      const height = parseFloat(p.height);
      const weight = parseFloat(p.weight);
      const bmi = height ? (weight / ((height / 100) ** 2)).toFixed(1) : null;

      // Attach a 0–100 risk score to every report
      const reports = p.reports.map((r) => {
        const risk = computeRiskScore({
          heart_rate: r.heart_rate,
          temperature: r.temperature,
          oxygen: r.oxygen,
          fall_detected: r.fall_detected,
        });
        return { ...r, risk_score: risk.score, risk_band: risk.band, risk_color: risk.color };
      });

      return {
        patient_id: p.patient_id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        email: p.email,
        phone: p.phone,
        address: p.address,
        height,
        weight,
        bmi,
        created_at: p.created_at,
        report_count: reports.length,
        latest_report: reports[0] || null,
        reports,
        emergency_contacts: p.emergency_contacts.map((c) => ({
          name: c.name,
          relationship: c.relationship,
          phone: c.phone,
        })),
      };
    });

    // Aggregate stats for the summary strip
    const totalReports = data.reduce((sum, p) => sum + p.report_count, 0);
    const atRisk = data.filter(
      (p) => p.latest_report && p.latest_report.risk_score >= 50
    ).length;

    res.json({
      total_patients: data.length,
      total_reports: totalReports,
      at_risk: atRisk,
      patients: data,
    });
  } catch (error) {
    console.error('getAllPatients error:', error);
    res.status(500).json({ error: 'Failed to fetch patients.', message: error.message });
  }
};

module.exports = { getAllPatients };
