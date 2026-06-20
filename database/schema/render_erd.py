#!/usr/bin/env python3
"""Render the Patient Monitoring System ER diagram to PNG using matplotlib."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ── Table definitions: (x, y of top-left), width, title, [(col, tag)] ──
# tag: PK, FK, UK, '' ; rows rendered in order
TABLES = {
    "patients": {
        "pos": (0.5, 15.0), "w": 3.7, "color": "#2563eb",
        "rows": [
            ("patient_id", "PK"), ("name", ""), ("age", ""), ("gender", ""),
            ("height  numeric(6,2)", ""), ("weight  numeric(6,2)", ""),
            ("address", ""), ("phone", ""), ("email", "UK"),
            ("password", ""), ("created_at", ""),
        ],
    },
    "health_reports": {
        "pos": (6.0, 15.0), "w": 4.4, "color": "#dc2626",
        "rows": [
            ("report_id", "PK"), ("patient_id", "FK"), ("heart_rate", ""),
            ("temperature  °F", ""), ("oxygen  SpO2 %", ""),
            ("fall_detected", ""), ("respiratory_rate", ""),
            ("systolic_bp", ""), ("diastolic_bp", ""),
            ("prediction", ""), ("recommendation", ""),
            ("probability", ""), ("model_used", ""),
            ("source  manual|device", ""), ("device_id  (soft ref)", ""),
            ("created_at", ""),
        ],
    },
    "emergency_contacts": {
        "pos": (0.5, 8.4), "w": 3.7, "color": "#16a34a",
        "rows": [
            ("contact_id", "PK"), ("patient_id", "FK"), ("name", ""),
            ("relationship", ""), ("phone", ""), ("created_at", ""),
        ],
    },
    "devices": {
        "pos": (6.0, 6.6), "w": 4.4, "color": "#9333ea",
        "rows": [
            ("device_id", "PK"), ("patient_id", "FK"), ("label", ""),
            ("device_type  esp32|rpi", ""), ("api_key", "UK"),
            ("active", ""), ("last_seen", ""), ("created_at", ""),
        ],
    },
}

ROW_H = 0.42
HEAD_H = 0.5
TAG_COLOR = {"PK": "#b45309", "FK": "#1d4ed8", "UK": "#7c3aed", "": "#374151"}

fig, ax = plt.subplots(figsize=(13, 11))
ax.set_xlim(0, 10.9)
ax.set_ylim(0, 16.4)
ax.axis("off")

anchors = {}  # table -> dict with edge midpoints and row y-positions

for name, t in TABLES.items():
    x, ytop = t["pos"]
    w = t["w"]
    n = len(t["rows"])
    total_h = HEAD_H + n * ROW_H
    ybot = ytop - total_h

    # body
    ax.add_patch(FancyBboxPatch(
        (x, ybot), w, total_h, boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=1.5, edgecolor=t["color"], facecolor="white", zorder=2))
    # header
    ax.add_patch(FancyBboxPatch(
        (x, ytop - HEAD_H), w, HEAD_H, boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=0, facecolor=t["color"], zorder=3))
    ax.text(x + w / 2, ytop - HEAD_H / 2, name, ha="center", va="center",
            color="white", fontsize=12, fontweight="bold", zorder=4)

    row_y = {}
    for i, (col, tag) in enumerate(t["rows"]):
        cy = ytop - HEAD_H - (i + 0.5) * ROW_H
        if i % 2 == 0:
            ax.add_patch(plt.Rectangle((x, cy - ROW_H / 2), w, ROW_H,
                         facecolor="#f3f4f6", edgecolor="none", zorder=2.5))
        label = col
        if tag:
            label = f"{col}"
            ax.text(x + w - 0.12, cy, tag, ha="right", va="center",
                    fontsize=7.5, fontweight="bold", color=TAG_COLOR[tag], zorder=4)
        ax.text(x + 0.15, cy, label, ha="left", va="center",
                fontsize=8.5, color="#111827", zorder=4)
        row_y[col.split()[0]] = cy

    anchors[name] = {
        "left": (x, (ytop + ybot) / 2), "right": (x + w, (ytop + ybot) / 2),
        "x": x, "w": w, "row_y": row_y,
    }

def connect(src, src_side, dst, dst_side, color, style="-", label="", rad=0.0, loff=(0, 0.12)):
    sx = anchors[src][src_side]
    dx = anchors[dst][dst_side]
    arr = FancyArrowPatch(sx, dx, connectionstyle=f"arc3,rad={rad}",
                          arrowstyle="-|>", mutation_scale=16,
                          linewidth=1.6, color=color, linestyle=style, zorder=1.5)
    ax.add_patch(arr)
    mx, my = (sx[0] + dx[0]) / 2, (sx[1] + dx[1]) / 2
    if label:
        ax.text(mx + loff[0], my + loff[1], label, ha="center", va="bottom",
                fontsize=7.5, color=color, style="italic")

# FK relationships (child.patient_id -> patients) ; arrow points to parent
connect("health_reports", "left", "patients", "right", "#dc2626", label="patient_id")
connect("devices", "left", "patients", "right", "#9333ea", label="patient_id", rad=-0.12)
connect("emergency_contacts", "right", "patients", "left", "#16a34a",
        label="patient_id", rad=0.2)
# soft ref device_id : health_reports.device_id -> devices (curve down the right side)
connect("health_reports", "right", "devices", "right", "#9333ea", style=(0, (4, 3)),
        label="device_id (soft)", rad=-0.55, loff=(0.55, 0))

ax.text(5.45, 16.1, "Patient Monitoring System — Database Schema (PostgreSQL)",
        ha="center", va="center", fontsize=15, fontweight="bold", color="#111827")
ax.text(5.45, 0.55,
        "Solid arrows = FK ON DELETE CASCADE   •   Dashed = soft reference (no constraint)   •   "
        "PK primary key  FK foreign key  UK unique",
        ha="center", va="center", fontsize=8.5, color="#6b7280")

plt.tight_layout()
out = "/Users/udita/Desktop/peripheral_project/database/schema/schema_diagram.png"
plt.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
print("wrote", out)
