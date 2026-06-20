-- Patient Monitoring System — PostgreSQL Setup
-- Run: psql -U postgres -d patient_monitoring -f database/create_tables.sql

CREATE TABLE IF NOT EXISTS patients (
    patient_id  SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    age         INTEGER NOT NULL CHECK (age > 0 AND age < 130),
    gender      VARCHAR(20) NOT NULL,
    height      NUMERIC(6,2) NOT NULL,   -- cm
    weight      NUMERIC(6,2) NOT NULL,   -- kg
    address     TEXT,
    phone       VARCHAR(20),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_reports (
    report_id        SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    heart_rate       NUMERIC(5,1) NOT NULL,
    temperature      NUMERIC(5,2) NOT NULL,     -- °F
    oxygen           NUMERIC(5,2) NOT NULL,     -- SpO₂ %
    fall_detected    BOOLEAN DEFAULT FALSE,
    respiratory_rate NUMERIC(5,1),              -- optional
    systolic_bp      NUMERIC(5,1),              -- optional
    diastolic_bp     NUMERIC(5,1),              -- optional
    prediction       VARCHAR(20) NOT NULL,      -- Normal / Warning / Emergency
    recommendation   TEXT NOT NULL,
    probability      NUMERIC(5,4),              -- ML confidence
    model_used       VARCHAR(60),
    created_at       TIMESTAMP DEFAULT NOW()
);

-- Up to 2 family/friend emergency contacts per patient
CREATE TABLE IF NOT EXISTS emergency_contacts (
    contact_id   SERIAL PRIMARY KEY,
    patient_id   INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    relationship VARCHAR(60),
    phone        VARCHAR(20) NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_patient_id ON emergency_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_patient_id ON health_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON health_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_email     ON patients(email);

-- Handy view: latest vitals per patient
CREATE OR REPLACE VIEW patient_summary AS
SELECT
    p.patient_id, p.name, p.age, p.gender, p.height, p.weight,
    ROUND(p.weight / POWER(p.height / 100.0, 2), 1) AS bmi,
    p.email,
    hr.heart_rate, hr.temperature, hr.oxygen, hr.fall_detected,
    hr.respiratory_rate, hr.systolic_bp, hr.diastolic_bp,
    hr.prediction, hr.recommendation, hr.probability, hr.model_used,
    hr.created_at AS last_report_time
FROM patients p
LEFT JOIN LATERAL (
    SELECT * FROM health_reports
    WHERE patient_id = p.patient_id
    ORDER BY created_at DESC LIMIT 1
) hr ON TRUE;


-- ──────────────────────────────────────────────────────────────
-- DEVICE INGESTION (ESP32 / Raspberry Pi direct data transfer)
-- Added for: each patient can have one or more boards that POST
-- vitals to /api/ingest using a per-device API key.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
    device_id    SERIAL PRIMARY KEY,
    patient_id   INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    label        VARCHAR(120),                 -- "Bed 4 ESP32"
    device_type  VARCHAR(20) NOT NULL,         -- "esp32" | "raspberry_pi"
    api_key      VARCHAR(120) UNIQUE NOT NULL, -- secret sent in X-Device-Key header
    active       BOOLEAN DEFAULT TRUE,
    last_seen    TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_api_key    ON devices(api_key);
CREATE INDEX IF NOT EXISTS idx_devices_patient_id ON devices(patient_id);

-- Tag every report with where it came from
ALTER TABLE health_reports ADD COLUMN IF NOT EXISTS source    VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE health_reports ADD COLUMN IF NOT EXISTS device_id INTEGER;
