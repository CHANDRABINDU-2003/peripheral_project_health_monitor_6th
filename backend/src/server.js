require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const reportRoutes = require('./routes/report');
const predictionRoutes = require('./routes/prediction');
const doctorRoutes = require('./routes/doctor');
const compatRoutes = require('./routes/compat');
const ingestRoutes = require('./routes/ingest');
const deviceRoutes = require('./routes/device');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve the frontend so one server hosts both the UI and the API (same origin)
app.use(express.static(path.join(__dirname, '../../frontend')));
app.get('/', (req, res) => res.redirect('/login.html'));

// Routes
app.use('/api', compatRoutes);        // frontend-compatible aliases
app.use('/api', authRoutes);
app.use('/api', patientRoutes);
app.use('/api', reportRoutes);
app.use('/api', predictionRoutes);
app.use('/api', doctorRoutes);
app.use('/api', deviceRoutes);        // register/list boards (JWT)
app.use('/api', ingestRoutes);        // ESP32 / Pi push vitals (device key)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Patient Monitoring API is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
