#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <math.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#define DS18B20_PIN 4
#define BUTTON_PIN 14
#define BUZZER_PIN 33
#define LED_PIN 19
#define TEMP_HIGH 38.5
#define TEMP_LOW 28.0
#define HR_HIGH 100
#define HR_LOW 70
#define SPO2_LOW 90
const char* ssid = "317";
const char* password = "LE0317axis";

const char* serverName =
"http://192.168.0.107:5000/emergency";

MAX30105 particleSensor;

OneWire oneWire(DS18B20_PIN);
DallasTemperature tempSensor(&oneWire);

Adafruit_MPU6050 mpu;
#define BUFFER_SIZE 50

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2;
int8_t validSPO2;

int32_t heartRate;
int8_t validHeartRate;

int stableHR = 75;
int stableSpO2 = 98;
bool freeFall = false;

unsigned long fallTime = 0;

bool fallDetected = false;
bool buzzerActive = false;
unsigned long buzzerStartTime = 0;

unsigned long fallAlertTime = 0;
void activateBuzzer()
{
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
}

void deactivateBuzzer()
{
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}
void setup()
{
  Serial.begin(115200);
  WiFi.begin(ssid, password);

Serial.print("Connecting WiFi");

while(WiFi.status()!=WL_CONNECTED)
{
    delay(500);
    Serial.print(".");
}

Serial.println();
Serial.println("WiFi Connected");

Serial.print("ESP32 IP: ");
Serial.println(WiFi.localIP());

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  deactivateBuzzer();

  Wire.begin(21, 22);

  tempSensor.begin();

  if (!mpu.begin())
  {
    Serial.println("MPU6050 NOT FOUND!");
    while (1);
  }

  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD))
  {
    Serial.println("MAX30102 NOT FOUND!");
    while (1);
  }

  particleSensor.setup(
      60,
      4,
      2,
      100,
      411,
      4096);

  activateBuzzer();
  delay(3000);
  deactivateBuzzer();

  Serial.println("System Ready");
}
float readTemperature()
{
  tempSensor.requestTemperatures();

  float tempC =
      tempSensor.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C)
  {
    return -1;
  }

  return tempC;
}
void readMAX30102()
{
  for (int i = 0; i < BUFFER_SIZE; i++)
  {
    while (!particleSensor.available())
    {
      particleSensor.check();
    }

    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();

    particleSensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(
      irBuffer,
      BUFFER_SIZE,
      redBuffer,
      &spo2,
      &validSPO2,
      &heartRate,
      &validHeartRate);

  if (heartRate < 0)
{
    validHeartRate = false;
}

if (spo2 < 0)
{
    validSPO2 = false;
}

if (irBuffer[BUFFER_SIZE - 1] < 50000)
{
    validHeartRate = false;
    validSPO2 = false;
}

// Store last good HR
if (validHeartRate)
{
    if (heartRate >= 40 && heartRate <= 200)
    {
        stableHR = heartRate;
    }
}

// Store last good SpO2
if (validSPO2)
{
    if (spo2 >= 85 && spo2 <= 100)
    {
        stableSpO2 = spo2;
    }
}

}
bool detectFall()
{
  sensors_event_t a, g, temp;

  mpu.getEvent(&a, &g, &temp);

  float x = a.acceleration.x;
  float y = a.acceleration.y;
  float z = a.acceleration.z;

  float total =
      sqrt(x * x +
           y * y +
           z * z);

  if (total < 7.0 && !freeFall)
  {
    freeFall = true;
    fallTime = millis();
  }

  if (freeFall &&
      total > 13.0 &&
      millis() - fallTime < 1000)
  {
    freeFall = false;

    fallAlertTime = millis();

    return true;
  }

  if (freeFall &&
      millis() - fallTime > 1000)
  {
    freeFall = false;
  }

  return false;
}
void checkButton()
{
  bool buttonPressed =
      digitalRead(BUTTON_PIN) == LOW;

  if(buttonPressed)
  {
    Serial.println("BUTTON EMERGENCY");
  }
}
void loop()
{
  float temperature = readTemperature();

  checkButton();

  readMAX30102();

  if (detectFall())
  {
    fallDetected = true;
  }

  if (millis() - fallAlertTime > 10000)
  {
    fallDetected = false;
  }

  bool emergency = false;

  // FALL
  if (fallDetected)
  {
    emergency = true;
  }

  // TEMPERATURE
  if (temperature > TEMP_HIGH)
  {
    emergency = true;
  }

  if (temperature > 0 &&
      temperature < TEMP_LOW)
  {
    emergency = true;
  }

  // HEART RATE
  if (stableHR > HR_HIGH)
  {
    emergency = true;
  }

  if (stableHR < HR_LOW)
  {
    emergency = true;
  }

  // SpO2
  if (stableSpO2 < SPO2_LOW)
  {
    emergency = true;
  }

  // SOS Button
  if (digitalRead(BUTTON_PIN) == LOW)
  {
    emergency = true;
  }

  // ==========================
  // BUZZER: 1 second beep only
  // ==========================

  static bool lastEmergency = false;

  // Emergency became TRUE
  if (emergency && !lastEmergency)
  {
    activateBuzzer();

    buzzerActive = true;
    buzzerStartTime = millis();
  }

  // Turn OFF after 1 second
  if (buzzerActive &&
      millis() - buzzerStartTime >= 1000)
  {
    deactivateBuzzer();
    buzzerActive = false;
  }

  lastEmergency = emergency;

  // ==========================
  // SEND DATA TO SERVER
  // ==========================

  if (WiFi.status() == WL_CONNECTED)
  {
    HTTPClient http;

    http.begin(serverName);

    http.addHeader(
        "Content-Type",
        "application/json");

    String jsonData =
    "{"
    "\"temperature\":" + String(temperature) + ","
    "\"heartRate\":" + String(stableHR) + ","
    "\"spo2\":" + String(stableSpO2) + ","
    "\"fall\":" + String(fallDetected ? 1 : 0) + ","
    "\"sos\":" + String(digitalRead(BUTTON_PIN) == LOW ? 1 : 0) + ","
    "\"emergency\":" + String(emergency ? 1 : 0) +
    "}";

    int response = http.POST(jsonData);

    Serial.print("HTTP Response: ");
    Serial.println(response);

    http.end();
  }

  Serial.println("--------------------------------");

  Serial.print("Temp : ");
  Serial.println(temperature);

  Serial.print("HR   : ");
  Serial.println(stableHR);

  Serial.print("SpO2 : ");
  Serial.println(stableSpO2);

  Serial.print("Fall : ");
  Serial.println(fallDetected);

  Serial.print("SOS  : ");
  Serial.println(digitalRead(BUTTON_PIN) == LOW);

  Serial.print("Emergency : ");
  Serial.println(emergency);

  delay(500);
}