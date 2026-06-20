# Patient Monitoring System

A full-stack health monitoring application with ML-powered risk prediction.

---

## Quick Start

### Option A — Docker (easiest)
```bash
docker-compose up --build
```
All services start automatically: PostgreSQL, Node.js backend, Python ML service.

---

### Option B — Manual Setup

#### 1. PostgreSQL
Create a database named `patient_monitoring`, then run:
```bash
psql -U postgres -d patient_monitoring -f database/schema/create_tables.sql
```

#### 2. Backend
```bash
cd backend
cp .env.example .env        # Edit DATABASE_URL, JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev --name init   # Creates tables via Prisma
npm run dev                          # Starts on http://localhost:5000
```

#### 3. ML Model
```bash
cd ml-model/src
pip install -r ../requirements.txt
python generate_dataset.py   # Creates data/raw/dataset.csv (2000 records)
python train_model.py        # Trains model -> models/model.pkl (99%+ accuracy)
python prediction.py         # Starts ML service on http://localhost:5001
```

---

## Project Structure

```
.
├── frontend/                 # Static UI (served by backend at same origin)
│   ├── *.html                # Pages / routes (login, dashboard, reports …)
│   └── assets/
│       ├── css/              # style.css
│       └── js/               # Role-based scripts
│           ├── auth/         # login.js, register.js
│           ├── patient/      # dashboard.js, report.js
│           ├── doctor/       # doctor-dashboard.js
│           └── shared/       # shap.js  (Chart.js is used in patient/dashboard.js)
│
├── backend/                  # Node.js / Express + Prisma API
│   ├── src/
│   │   ├── server.js         # App entry (npm start → node src/server.js)
│   │   ├── config/           # prisma.js — shared PrismaClient singleton
│   │   ├── routes/           # HTTP route definitions
│   │   ├── controllers/      # Request handlers / business logic
│   │   ├── middleware/       # auth & device-key guards
│   │   └── utils/            # riskScore.js
│   ├── scripts/              # create-device.js (CLI admin tools)
│   ├── prisma/               # schema.prisma
│   └── uploads/              # User-uploaded files (served at /uploads)
│
├── database/
│   ├── schema/               # create_tables.sql
│   └── migrations/           # SQL migrations
│
├── ml-model/                 # Python ML pipeline + Flask service (port 5001)
│   ├── src/                  # Pipeline + serving code
│   ├── data/{raw,processed}/ # Datasets
│   ├── models/               # Trained models (.joblib / .pkl)
│   └── artifacts/            # Metrics & metadata (.json)
│
└── firmware/                 # IoT device code
    ├── esp32/
    └── raspberry_pi/
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/register` | No | Register new patient |
| POST | `/api/login` | No | Login, returns JWT |
| GET | `/api/current` | JWT | Current condition + latest report |
| GET | `/api/history` | JWT | All past reports |
| POST | `/api/report` | JWT | Submit vitals → runs ML → saves report |
| GET | `/api/report/today` | JWT | Today's reports |
| POST | `/api/predict` | JWT | Predict without saving |

### Authentication
All protected routes require:
```
Authorization: Bearer <token>
```

### POST /api/register
```json
{
  "name": "John Doe",
  "age": 45,
  "gender": "Male",
  "height": 175,
  "weight": 75,
  "address": "123 Main St",
  "phone": "01700000000",
  "email": "john@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

### POST /api/report
```json
{
  "heart_rate": 88,
  "temperature": 98.6,
  "oxygen": 97,
  "fall_detected": false
}
```
Response:
```json
{
  "prediction": "Normal",
  "recommendation": "Continue regular monitoring. Stay hydrated...",
  "reasons": ["All vitals within normal range"]
}
```

---

## ML Model

- **Algorithm**: Random Forest (200 trees)
- **Accuracy**: ~99% on test set
- **Features**: age, gender, heart_rate, temperature, oxygen, fall_detected
- **Classes**: Normal / Warning / Emergency
- **Fallback**: If ML service is down, rule-based logic activates automatically

### Risk Rules
| Condition | Risk Level |
|-----------|------------|
| HR > 120 AND SpO₂ < 92 | Emergency |
| Fall detected | Emergency |
| Temp > 100.4 AND HR > 100 | Warning |
| HR > 110 or HR < 50 | Warning |
| SpO₂ < 95 | Warning |
| All within range | Normal |

---

## ⚠️ Medical Disclaimer
All recommendations are **informational only** and not a substitute for professional medical advice. Always consult a qualified healthcare provider for medical decisions.
