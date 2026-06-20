/* =====================================================================
 *  ESP32 → Patient Monitoring System  (direct data transfer)
 *
 *  It reads vitals from sensors and POSTs them to your backend's
 *  /api/ingest endpoint. The server runs the ML model and saves a report,
 *  exactly like a manual entry — but tagged source = "device".
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  YOU ONLY NEED TO CHANGE THE 3 VALUES IN THE "CONFIG" BLOCK   │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  Arduino IDE setup:
 *    1. Boards Manager → install "esp32" (Espressif Systems).
 *    2. Tools → Board → "ESP32 Dev Module".
 *    3. Library Manager → install "ArduinoJson" (by Benoit Blanchon).
 *    4. (Sensors, optional) "SparkFun MAX3010x" for HR/SpO2,
 *       "Adafruit MLX90614" for temperature, "Adafruit MPU6050" for falls.
 * ===================================================================== */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/* =====================  CONFIG — CHANGE THESE 3  ===================== */

// 1) Your WiFi (ESP32 only supports 2.4 GHz networks, not 5 GHz)
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// 2) Where your backend is reachable from the ESP32.
//    Use the computer's LAN IP (NOT "localhost" — that means the ESP32 itself).
//    Find it: macOS `ipconfig getifaddr en0` / Windows `ipconfig`.
//    The ESP32 and the server must be on the SAME WiFi network.
const char* SERVER_URL = "http://192.168.1.50:5000/api/ingest";

// 3) The device passcode you generated:
//      cd backend && node create-device.js <patient_id> "My ESP32" esp32
//    Copy the printed DEVICE_API_KEY here. This is what binds THIS board
//    to ONE patient — the server figures out the patient from this key.
const char* DEVICE_API_KEY = "PASTE_THE_48_CHAR_KEY_HERE";

// How often to send a reading (milliseconds). 60000 = once per minute.
const unsigned long SEND_INTERVAL_MS = 60000;

/* =================================================================== */

unsigned long lastSend = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\nConnected. ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

/* ---- Replace these stubs with REAL sensor reads ---------------------
 * Keep the UNITS the backend expects:
 *   heart_rate  : bpm   (valid 20–300)
 *   temperature : °F    (valid 90–115)  <-- if your sensor gives °C:
 *                                           F = C * 9.0 / 5.0 + 32.0
 *   oxygen      : SpO2 %% (valid 50–100)
 *   fall        : true/false
 * ------------------------------------------------------------------- */
float readHeartRate()   { return 78.0;  }   // TODO: MAX30102
float readTemperatureF(){ return 98.6;  }   // TODO: MLX90614 (convert C→F)
float readSpO2()        { return 97.0;  }   // TODO: MAX30102
bool  readFall()        { return false; }   // TODO: MPU6050

bool sendVitals(float hr, float tempF, float spo2, bool fall) {
  if (WiFi.status() != WL_CONNECTED) { connectWiFi(); }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);   // <-- the passcode

  // Body must match what /api/report and /api/ingest expect.
  StaticJsonDocument<256> doc;
  doc["heart_rate"]    = hr;
  doc["temperature"]   = tempF;
  doc["oxygen"]        = spo2;
  doc["fall_detected"] = fall;
  // Optional extra vitals (the model uses defaults if omitted):
  // doc["respiratory_rate"] = 16;
  // doc["systolic_bp"]      = 120;
  // doc["diastolic_bp"]     = 80;

  String body;
  serializeJson(doc, body);

  int status = http.POST(body);
  String resp = http.getString();
  Serial.printf("POST %s -> %d\n", SERVER_URL, status);
  Serial.println(resp);
  http.end();

  // 201 = report created. 401 = bad/inactive device key. 400 = bad vitals.
  return status == 201;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  connectWiFi();
  // TODO: initialize your sensors here (Wire.begin(); particleSensor.begin(); ...)
}

void loop() {
  if (millis() - lastSend >= SEND_INTERVAL_MS || lastSend == 0) {
    lastSend = millis();

    float hr    = readHeartRate();
    float tempF = readTemperatureF();
    float spo2  = readSpO2();
    bool  fall  = readFall();

    sendVitals(hr, tempF, spo2, fall);
  }
  // (You can also send immediately when readFall() becomes true.)
}
