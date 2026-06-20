const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.patient = decoded; // { patient_id, email }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Requires a valid token AND the doctor role.
const verifyDoctor = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.patient && req.patient.role === 'doctor') return next();
    return res.status(403).json({ error: 'Access denied. Doctor account required.' });
  });
};

module.exports = { verifyToken, verifyDoctor };
