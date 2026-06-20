"""
Generate synthetic patient health monitoring dataset
Run: python generate_dataset.py
Outputs: dataset.csv
"""
import csv
import random
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

random.seed(42)

def generate_patient(label_override=None):
    """Generate one patient record with a risk label."""
    age = random.randint(18, 85)
    gender = random.choice([0, 1])  # 0=Female, 1=Male

    # Base ranges vary slightly with age
    age_factor = 1.0 + (age - 45) * 0.003  # older = slightly higher HR

    if label_override == 'Normal' or label_override is None:
        heart_rate   = round(random.uniform(60, 100) * age_factor, 1)
        temperature  = round(random.uniform(97.0, 99.4), 1)
        oxygen       = round(random.uniform(96, 100), 1)
        fall         = 0
        label        = 'Normal'

    elif label_override == 'Warning':
        # Warning: mild abnormalities
        choice = random.choice(['hr_high', 'hr_low', 'temp_high', 'spo2_low'])
        if choice == 'hr_high':
            heart_rate  = round(random.uniform(101, 115), 1)
            temperature = round(random.uniform(99.5, 101.0), 1)
            oxygen      = round(random.uniform(95, 97), 1)
        elif choice == 'hr_low':
            heart_rate  = round(random.uniform(45, 59), 1)
            temperature = round(random.uniform(97.0, 99.4), 1)
            oxygen      = round(random.uniform(95, 99), 1)
        elif choice == 'temp_high':
            heart_rate  = round(random.uniform(90, 110), 1)
            temperature = round(random.uniform(100.5, 102.5), 1)
            oxygen      = round(random.uniform(95, 98), 1)
        else:  # spo2_low
            heart_rate  = round(random.uniform(70, 110), 1)
            temperature = round(random.uniform(98.0, 100.0), 1)
            oxygen      = round(random.uniform(92, 95), 1)
        fall  = 0
        label = 'Warning'

    else:  # Emergency
        choice = random.choice(['high_hr_low_spo2', 'very_high_temp', 'fall', 'multi'])
        if choice == 'high_hr_low_spo2':
            heart_rate  = round(random.uniform(121, 160), 1)
            temperature = round(random.uniform(98.0, 103.5), 1)
            oxygen      = round(random.uniform(80, 91), 1)
            fall        = 0
        elif choice == 'very_high_temp':
            heart_rate  = round(random.uniform(100, 140), 1)
            temperature = round(random.uniform(103.5, 106.0), 1)
            oxygen      = round(random.uniform(88, 95), 1)
            fall        = 0
        elif choice == 'fall':
            heart_rate  = round(random.uniform(60, 140), 1)
            temperature = round(random.uniform(97.0, 101.0), 1)
            oxygen      = round(random.uniform(88, 99), 1)
            fall        = 1
        else:  # multi
            heart_rate  = round(random.uniform(130, 180), 1)
            temperature = round(random.uniform(102.0, 105.0), 1)
            oxygen      = round(random.uniform(80, 90), 1)
            fall        = random.choice([0, 1])
        label = 'Emergency'

    # Clamp to realistic bounds
    heart_rate  = max(30, min(200, heart_rate))
    temperature = max(95.0, min(108.0, temperature))
    oxygen      = max(70.0, min(100.0, oxygen))

    return {
        'age': age,
        'gender': gender,
        'heart_rate': heart_rate,
        'temperature': temperature,
        'oxygen': oxygen,
        'fall_detected': fall,
        'label': label
    }


def main():
    # Balanced dataset: 1000 Normal, 500 Warning, 500 Emergency = 2000 total
    records = []
    for _ in range(1000):
        records.append(generate_patient('Normal'))
    for _ in range(500):
        records.append(generate_patient('Warning'))
    for _ in range(500):
        records.append(generate_patient('Emergency'))

    # Shuffle
    random.shuffle(records)

    # Write CSV
    fieldnames = ['age', 'gender', 'heart_rate', 'temperature', 'oxygen', 'fall_detected', 'label']
    with open(os.path.join(ROOT, "data", "raw", "dataset.csv"), 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"Dataset generated: {len(records)} records -> dataset.csv")
    label_counts = {}
    for r in records:
        label_counts[r['label']] = label_counts.get(r['label'], 0) + 1
    for k, v in sorted(label_counts.items()):
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
