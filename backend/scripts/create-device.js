/**
 * Mint a device API key for a patient from the command line.
 *
 * Usage:
 *   node create-device.js <patient_id> [label] [device_type]
 *
 * Examples:
 *   node create-device.js 1
 *   node create-device.js 1 "Bed 4 ESP32" esp32
 *   node create-device.js 2 "Ward Pi" raspberry_pi
 *
 * It prints the api_key ONCE — copy it into your ESP32 / Pi code.
 */
const crypto = require('crypto');
const prisma = require('../src/config/prisma');

async function main() {
  const patient_id = parseInt(process.argv[2], 10);
  const label = process.argv[3] || null;
  const device_type = process.argv[4] === 'raspberry_pi' ? 'raspberry_pi' : 'esp32';

  if (!patient_id) {
    console.error('Usage: node create-device.js <patient_id> [label] [device_type]');
    process.exit(1);
  }

  const patient = await prisma.patient.findUnique({ where: { patient_id } });
  if (!patient) {
    console.error(`No patient with patient_id=${patient_id}. Register the patient first.`);
    process.exit(1);
  }

  const api_key = crypto.randomBytes(24).toString('hex');
  const device = await prisma.device.create({
    data: { patient_id, label, device_type, api_key },
  });

  console.log('\n  Device registered \n');
  console.log('  patient      :', patient.name, `(patient_id=${patient_id})`);
  console.log('  device_id    :', device.device_id);
  console.log('  device_type  :', device.device_type);
  console.log('  label        :', label || '(none)');
  console.log('\n  >>> COPY THIS INTO YOUR BOARD (X-Device-Key) <<<');
  console.log('  DEVICE_API_KEY =', api_key, '\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
