const pool = require('../config/db');

exports.getActions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const device = req.query.device || 'All';
    const action = req.query.action || 'All';
    const status = req.query.status || 'All';
    const keyword = req.query.keyword ? req.query.keyword.trim() : '';

    const conditions = [];
    const params = [];

    if (device !== 'All') {
      conditions.push('d.device_name = ?');
      params.push(device);
    }
    if (action !== 'All') {
      conditions.push('ah.action = ?');
      params.push(action);
    }
    if (status !== 'All') {
      conditions.push('ah.status = ?');
      params.push(status);
    }
    if (keyword) {
      conditions.push('DATE_FORMAT(ah.executed_at, "%Y-%m-%d %H:%i:%s") LIKE ?');
      params.push(`%${keyword}%`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM action_history ah
      JOIN device d ON ah.device_id = d.device_id
      JOIN \`user\` u ON ah.user_id = u.user_id
      ${whereClause}
    `;
    const [countRows] = await pool.query(countSql, params);
    const totalEntries = countRows[0].total;

    const dataSql = `
      SELECT ah.action_id, d.device_name, u.user_name, ah.action, ah.status, 
             DATE_FORMAT(ah.executed_at, '%Y-%m-%d %H:%i:%s') AS executed_at
      FROM action_history ah
      JOIN device d ON ah.device_id = d.device_id
      JOIN \`user\` u ON ah.user_id = u.user_id
      ${whereClause}
      ORDER BY ah.action_id DESC
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
    console.error('Lỗi SQL Actions:', e);
    res.status(500).json({ error: e.message });
  }
};