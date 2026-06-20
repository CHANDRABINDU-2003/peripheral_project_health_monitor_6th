const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// ── Doctor account (single, hardcoded) ───────────────────────────────
// A doctor sees the whole patient dataset. There is no doctor table, so the
// credentials live here. Override via env in production.
const DOCTOR_EMAIL    = process.env.DOCTOR_EMAIL    || 'chandra@gmail.com';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || 'Udita@2003';
const DOCTOR_NAME     = process.env.DOCTOR_NAME     || 'Dr. Chandra';

// POST /api/register
const register = async (req, res) => {
  try {
    const { name, age, gender, height, weight, address, phone, email, password, confirmPassword } = req.body;

    // Validation
    if (!name || !age || !gender || !height || !weight || !email || !password) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if email already exists
    const existingPatient = await prisma.patient.findUnique({ where: { email } });
    if (existingPatient) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create patient
    const patient = await prisma.patient.create({
      data: {
        name,
        age: parseInt(age),
        gender,
        height: parseFloat(height),
        weight: parseFloat(weight),
        address: address || null,
        phone: phone || null,
        email,
        password: hashedPassword
      }
    });

    res.status(201).json({
      message: 'Registration successful! Please log in.',
      patient_id: patient.patient_id
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// POST /api/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // ── Doctor login ──────────────────────────────────────────────
    if (email.toLowerCase() === DOCTOR_EMAIL.toLowerCase() && password === DOCTOR_PASSWORD) {
      const token = jwt.sign(
        { role: 'doctor', email: DOCTOR_EMAIL },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({
        message: 'Login successful',
        token,
        role: 'doctor',
        doctor: { name: DOCTOR_NAME, email: DOCTOR_EMAIL }
      });
    }

    // Find patient
    const patient = await prisma.patient.findUnique({ where: { email } });
    if (!patient) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, patient.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { patient_id: patient.patient_id, email: patient.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Calculate BMI
    const bmi = (patient.weight / ((patient.height / 100) ** 2)).toFixed(1);

    res.json({
      message: 'Login successful',
      token,
      role: 'patient',
      patient: {
        patient_id: patient.patient_id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        height: patient.height,
        weight: patient.weight,
        email: patient.email,
        bmi
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

module.exports = { register, login };
