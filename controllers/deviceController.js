const pool = require('../config/db');

exports.getDevices = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM device');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};