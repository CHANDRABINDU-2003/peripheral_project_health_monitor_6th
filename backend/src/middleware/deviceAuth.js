const prisma = require('../config/prisma');

// Authenticates an ESP32 / Raspberry Pi instead of a logged-in user.
// The board sends its secret in the request header:  X-Device-Key: <api_key>
// We look the key up, find which patient it belongs to, and attach the same
// `req.patient` shape that verifyToken (JWT) produces — so the existing
// createReport controller works unchanged.
const verifyDevice = async (req, res, next) => {
  try {
    const key = req.headers['x-device-key'];
    if (!key) {
      return res.status(401).json({ error: 'Missing device key (X-Device-Key header).' });
    }

    const device = await prisma.device.findUnique({
      where: { api_key: key },
    });

    if (!device || !device.active) {
      return res.status(401).json({ error: 'Invalid or inactive device key.' });
    }

    // Record that we heard from this board (for an "online/offline" indicator later)
    await prisma.device.update({
      where: { device_id: device.device_id },
      data: { last_seen: new Date() },
    });

    // Same shape verifyToken sets, so downstream controllers don't care how we authed.
    req.patient = { patient_id: device.patient_id };
    req.device = device;
    next();
  } catch (error) {
    console.error('verifyDevice error:', error);
    return res.status(500).json({ error: 'Device authentication failed.' });
  }
};

module.exports = { verifyDevice };
