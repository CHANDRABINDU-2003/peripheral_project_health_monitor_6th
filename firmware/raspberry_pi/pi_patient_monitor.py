#!/usr/bin/env python3
"""
Raspberry Pi (or any laptop) -> Patient Monitoring System.

Reads vitals and POSTs them to your backend's /api/ingest endpoint.
The server runs the ML model and saves a report, tagged source = "device".

CHANGE THE 2 VALUES IN THE CONFIG BLOCK:
  SERVER_URL     -> your laptop's LAN IP that runs the backend (NOT localhost,
                    because this script runs on a DIFFERENT machine).
  DEVICE_API_KEY -> the key printed by:  node create-device.js <patient_id> "Pi" raspberry_pi

Install the one dependency first:   pip install requests
Run:                                python3 pi_patient_monitor.py
"""
import time
import requests

# ===================== CONFIG — CHANGE THESE 2 =====================

# The laptop that runs `npm run dev` (your backend). Find its IP on THAT
# laptop with:  macOS `ipconfig getifaddr en0`  /  Windows `ipconfig`.
# Both machines must be on the SAME Wi-Fi.
SERVER_URL = "http://10.231.108.56:8000/api/ingest"

# The device passcode (binds this Pi to one patient).
DEVICE_API_KEY = "PASTE_THE_48_CHAR_KEY_HERE"

# How often to send (seconds).
SEND_INTERVAL_S = 60

# ==================================================================


def read_sensors():
    """Replace with real GPIO/I2C reads. Keep these UNITS:
       heart_rate  : bpm   (20-300)
       temperature : F     (90-115)   # if your sensor is Celsius: f = c * 9/5 + 32
       oxygen      : SpO2 %% (50-100)
       fall        : bool
    """
    return {
        "heart_rate": 78,
        "temperature": 98.6,
        "oxygen": 97,
        "fall_detected": False,
        # optional: "respiratory_rate": 16, "systolic_bp": 120, "diastolic_bp": 80,
    }


def send(payload):
    headers = {"X-Device-Key": DEVICE_API_KEY}
    try:
        r = requests.post(SERVER_URL, json=payload, headers=headers, timeout=10)
        print(r.status_code, r.json())
        return r.status_code == 201
    except requests.RequestException as e:
        print("send failed (will retry next cycle):", e)
        return False


if __name__ == "__main__":
    print(f"Sending to {SERVER_URL} every {SEND_INTERVAL_S}s. Ctrl-C to stop.")
    while True:
        send(read_sensors())
        time.sleep(SEND_INTERVAL_S)
