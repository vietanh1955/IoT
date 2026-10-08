const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getVNTimeString(date = new Date()) {
  const vnDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const yyyy = vnDate.getFullYear();
  const MM = String(vnDate.getMonth() + 1).padStart(2, '0');
  const dd = String(vnDate.getDate()).padStart(2, '0');
  const hh = String(vnDate.getHours()).padStart(2, '0');
  const mm = String(vnDate.getMinutes()).padStart(2, '0');
  const ss = String(vnDate.getSeconds()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
}

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'VanH1905', 
  database: 'iot_lab',
  waitForConnections: true,
  connectionLimit: 10
});

const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SENSOR   = 'vanh_iot/data_sensor';
const TOPIC_CONTROL  = 'vanh_iot/device_control';
const TOPIC_RESPONSE = 'vanh_iot/device_response';
const TOPIC_SYNC     = 'vanh_iot/device_sync'; 

const mqttClient = mqtt.connect(MQTT_BROKER);
const pendingActions = new Map();

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected successfully to HiveMQ Broker');
  mqttClient.subscribe([TOPIC_SENSOR, TOPIC_RESPONSE, TOPIC_SYNC]);
});

async function executeDeviceControl(devId, act, origin = 'MANUAL') {
  const currentUserId = 1;
  const timeStr = getVNTimeString();

  const [devRows] = await pool.query('SELECT device_name, status FROM device WHERE device_id = ?', [devId]);
  const devName = devRows.length ? devRows[0].device_name : `Device ${devId}`;
  const previousStatus = devRows.length ? Number(devRows[0].status) : 0;

  const [ins] = await pool.query(
    'INSERT INTO action_history (device_id, user_id, action, status, executed_at) VALUES (?, ?, ?, ?, ?)',
    [devId, currentUserId, act, 'LOADING', timeStr]
  );

  io.emit('action_logged', {
    action_id: ins.insertId,
    device_name: devName,
    action: act,
    status: 'LOADING',
    executed_at: timeStr
  });

  mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ deviceId: parseInt(devId), action: act }));

  const key = `${devId}_${act}`;
  const timer = setTimeout(async () => {
    if (pendingActions.has(key)) {
      console.log(`[Action Timeout] Device ${devId} did not respond -> Trigger FAILED & REVERT`);
      pendingActions.delete(key);

      const failTimeStr = getVNTimeString();
      const [failIns] = await pool.query(
        'INSERT INTO action_history (device_id, user_id, action, status, executed_at) VALUES (?, ?, ?, ?, ?)',
        [devId, currentUserId, act, 'FAILED', failTimeStr]
      );

      io.emit('action_logged', {
        action_id: failIns.insertId,
        device_name: devName,
        action: act,
        status: 'FAILED',
        executed_at: failTimeStr
      });

      await pool.query('UPDATE device SET status = ? WHERE device_id = ?', [previousStatus, devId]);

      io.emit('device_state_sync', {
        deviceId: parseInt(devId),
        status: previousStatus,
        reason: 'TIMEOUT_FAILED'
      });
    }
  }, 3500);

  pendingActions.set(key, { timer, devName, previousStatus, targetAction: act });
}

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === TOPIC_SYNC) {
      console.log('[MQTT Sync Request] ESP8266 connected. Pushing DB device states to board...');
      const [devices] = await pool.query('SELECT device_id, status FROM device');
      
      devices.forEach(dev => {
        const act = Number(dev.status) === 1 ? 'ON' : 'OFF';
        mqttClient.publish(TOPIC_CONTROL, JSON.stringify({
          deviceId: parseInt(dev.device_id),
          action: act
        }));
      });
      return;
    }

    if (topic === TOPIC_SENSOR) {
      const { temperature, humidity, light } = data;
      const lightVal = parseInt(light);
      const timeStr = getVNTimeString();

      await pool.query(
        'INSERT INTO sensor_data (sensor_id, reading_value, recorded_at) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        [1, temperature, timeStr, 2, humidity, timeStr, 3, lightVal, timeStr]
      );

      io.emit('sensor_telemetry', {
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity),
        light: lightVal,
        time: timeStr
      });

      const LIGHT_LIMIT = 50;
      if (lightVal < LIGHT_LIMIT) {
        io.emit('alert_trigger', {
          type: 'LOW_LIGHT',
          message: `Ánh sáng phòng yếu (${lightVal} Lux < ${LIGHT_LIMIT} Lux). Hệ thống đang kích hoạt bật đèn!`,
          value: lightVal
        });

        const [lightDev] = await pool.query('SELECT status FROM device WHERE device_id = 2');
        if (lightDev.length && Number(lightDev[0].status) === 0 && !pendingActions.has('2_ON')) {
          console.log('[AUTO ALERT] Light < 50 Lux -> Auto turning ON Relay Light 01');
          await executeDeviceControl(2, 'ON', 'AUTO');
        }
      }
    }

    if (topic === TOPIC_RESPONSE) {
      console.log('[MQTT Response received]:', data);
      const devId = String(data.deviceId);
      const act = String(data.action).toUpperCase();
      const key = `${devId}_${act}`;

      if (pendingActions.has(key)) {
        const item = pendingActions.get(key);
        clearTimeout(item.timer);
        pendingActions.delete(key);

        const currentUserId = 1;
        const timeStr = getVNTimeString();
        const newStatus = act === 'ON' ? 1 : 0;

        await pool.query('UPDATE device SET status = ?, last_connected = NOW() WHERE device_id = ?', [newStatus, devId]);

        const [ins] = await pool.query(
          'INSERT INTO action_history (device_id, user_id, action, status, executed_at) VALUES (?, ?, ?, ?, ?)',
          [devId, currentUserId, act, 'SUCCESS', timeStr]
        );

        io.emit('action_logged', {
          action_id: ins.insertId,
          device_name: item.devName,
          action: act,
          status: 'SUCCESS',
          executed_at: timeStr
        });

        io.emit('device_state_sync', {
          deviceId: parseInt(devId),
          status: newStatus,
          reason: 'SUCCESS'
        });
      }
    }
  } catch (err) {
    console.error('[MQTT Error]', err.message);
  }
});

io.on('connection', (socket) => {
  socket.on('send_control', async (payload) => {
    const devId = String(payload.deviceId);
    const act = String(payload.action).toUpperCase();
    await executeDeviceControl(devId, act, 'MANUAL');
  });
});

app.get('/api/sensors', async (req, res) => {
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
});

app.get('/api/actions', async (req, res) => {
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
});

app.get('/api/devices', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM device');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sensors/history', async (req, res) => {
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
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`[HTTP Server] Running at: http://localhost:${PORT}`);
});