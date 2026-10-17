const pool = require('../config/db');
const { getVNTimeString } = require('../utils/timeUtil');

exports.getSensors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const field = req.query.field || '';
    const keyword = req.query.keyword ? req.query.keyword.trim() : '';

    let whereClause = '';
    const params = [];

    if (field && keyword) {
      if (field === 'Time') {
        whereClause = 'WHERE DATE_FORMAT(sd.recorded_at, "%Y-%m-%d %H:%i:%s") LIKE ?';
        params.push(`%${keyword}%`);
      } else if (['Temperature', 'Humidity', 'Ambient Light'].includes(field)) {
        whereClause = 'WHERE s.sensor_type = ? AND CAST(sd.reading_value AS CHAR) LIKE ?';
        params.push(field, `%${keyword}%`);
      }
    }

    const countSql = `
      SELECT COUNT(*) AS total 
      FROM sensor_data sd 
      JOIN sensor s ON sd.sensor_id = s.sensor_id 
      ${whereClause}
    `;
    const [countRows] = await pool.query(countSql, params);
    const totalEntries = countRows[0].total;

    const dataSql = `
      SELECT sd.data_id, s.sensor_type, s.unit, sd.reading_value, 
             DATE_FORMAT(sd.recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at
      FROM sensor_data sd
      JOIN sensor s ON sd.sensor_id = s.sensor_id
      ${whereClause}
      ORDER BY sd.data_id DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [rows] = await pool.query(dataSql, params);

    res.json({
      total: totalEntries,
      page,
      limit,
      data: rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getSensorHistory = async (req, res) => {
  try {
    const range = req.query.range || '24h';
    const hours = range === '1h' ? 1 : 24;
    const currentVNTime = getVNTimeString();
    const timePattern = range === '1h' 
      ? "CONCAT(DATE_FORMAT(sd.recorded_at, '%H:'), LPAD(FLOOR(MINUTE(sd.recorded_at) / 5) * 5, 2, '0'))" 
      : "DATE_FORMAT(sd.recorded_at, '%H:00')";

    const query = `
      SELECT 
        ${timePattern} AS time_label,
        s.sensor_type,
        ROUND(AVG(sd.reading_value), 1) AS avg_value
      FROM sensor_data sd
      JOIN sensor s ON sd.sensor_id = s.sensor_id
      WHERE sd.recorded_at >= (STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s') - INTERVAL ? HOUR)
        AND sd.recorded_at <= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
      GROUP BY time_label, s.sensor_type
      ORDER BY MIN(sd.recorded_at) ASC
    `;

    const [rows] = await pool.query(query, [currentVNTime, hours, currentVNTime]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};