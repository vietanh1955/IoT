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

// Hàm định dạng chuẩn múi giờ Việt Nam (UTC+7): YYYY-MM-DD HH:mm:ss
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

// 1. Kết nối CSDL MySQL (Điền mật khẩu nếu có)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'VanH1905', 
  database: 'iot_lab',
  waitForConnections: true,
  connectionLimit: 10
});

// 2. Cấu hình MQTT Broker HiveMQ
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SENSOR   = 'iot_ptit/data_sensor';
const TOPIC_CONTROL  = 'iot_ptit/device_control';
const TOPIC_RESPONSE = 'iot_ptit/device_response';

const mqttClient = mqtt.connect(MQTT_BROKER);

// Quản lý các lệnh đang chờ mạch phản hồi (Map theo key: "deviceId_action")
const pendingActions = new Map();

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected successfully to HiveMQ Broker');
  mqttClient.subscribe([TOPIC_SENSOR, TOPIC_RESPONSE]);
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    // 1. Nhận dữ liệu cảm biến định kỳ -> Lưu CSDL và bắn Socket lên Web
    if (topic === TOPIC_SENSOR) {
      const { temperature, humidity, light } = data;
      const timeStr = getVNTimeString();

      await pool.query(
        'INSERT INTO sensor_data (sensor_id, reading_value, recorded_at) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        [1, temperature, timeStr, 2, humidity, timeStr, 3, light, timeStr]
      );

      io.emit('sensor_telemetry', {
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity),
        light: parseInt(light),
        time: timeStr
      });
    }

    // 2. Nhận phản hồi ACK từ ESP8266 -> APPEND bản ghi SUCCESS vào CSDL và Web
    if (topic === TOPIC_RESPONSE) {
      console.log('[MQTT Response received]:', data);
      const devId = String(data.deviceId);
      const act = String(data.action).toUpperCase();
      const key = `${devId}_${act}`;

      if (pendingActions.has(key)) {
        const item = pendingActions.get(key);
        clearTimeout(item.timer); // Hủy bộ đếm timeout
        pendingActions.delete(key);

        const currentUserId = 1;
        const timeStr = getVNTimeString();

        // Ghi bản ghi mới mang trạng thái SUCCESS (Append)
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
      }
    }
  } catch (err) {
    console.error('[MQTT Error]', err.message);
  }
});

// 3. Socket.io nhận lệnh điều khiển từ Web Dashboard
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);

  socket.on('send_control', async (payload) => {
    console.log('[Web Control Send]:', payload);
    const devId = String(payload.deviceId);
    const act = String(payload.action).toUpperCase();
    const tinyStatus = act === 'ON' ? 1 : 0;
    const currentUserId = 1;
    const timeStr = getVNTimeString();

    try {
      // BƯỚC 1: CẬP NHẬT NGAY TRẠNG THÁI DEVICE VÀO DB (Đảm bảo reload trang giữ đúng trạng thái mới nhất)
      await pool.query('UPDATE device SET status = ?, last_connected = NOW() WHERE device_id = ?', [tinyStatus, devId]);

      const [devRows] = await pool.query('SELECT device_name FROM device WHERE device_id = ?', [devId]);
      const devName = devRows.length ? devRows[0].device_name : `Device ${devId}`;

      // BƯỚC 2: APPEND BẢN GHI LOADING VÀO CSDL
      const [ins] = await pool.query(
        'INSERT INTO action_history (device_id, user_id, action, status, executed_at) VALUES (?, ?, ?, ?, ?)',
        [devId, currentUserId, act, 'LOADING', timeStr]
      );

      // BƯỚC 3: APPEND DÒNG LOADING LÊN GIAO DIỆN WEB
      io.emit('action_logged', {
        action_id: ins.insertId,
        device_name: devName,
        action: act,
        status: 'LOADING',
        executed_at: timeStr
      });

      // BƯỚC 4: GỬI LỆNH MQTT XUỐNG MẠCH ESP8266
      mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ deviceId: parseInt(devId), action: act }));

      // BƯỚC 5: THIẾT LẬP TIMEOUT 3.5s -> NẾU RÚT MẠCH HOẶC KHÔNG CÓ PHẢN HỒI THÌ APPEND FAILED
      const key = `${devId}_${act}`;
      const timer = setTimeout(async () => {
        if (pendingActions.has(key)) {
          console.log(`[Action Timeout] Device ${devId} did not respond -> Trigger FAILED`);
          pendingActions.delete(key);

          const failTimeStr = getVNTimeString();
          const [failIns] = await pool.query(
            'INSERT INTO action_history (device_id, user_id, action, status, executed_at) VALUES (?, ?, ?, ?, ?)',
            [devId, currentUserId, act, 'FAILED', failTimeStr]
          );

          // APPEND DÒNG FAILED LÊN GIAO DIỆN WEB
          io.emit('action_logged', {
            action_id: failIns.insertId,
            device_name: devName,
            action: act,
            status: 'FAILED',
            executed_at: failTimeStr
          });
        }
      }, 3500);

      pendingActions.set(key, { timer, devName });

    } catch (err) {
      console.error('[Control DB Error]', err.message);
    }
  });
});

// 4. REST API Endpoints
app.get('/api/sensors', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT sd.data_id, s.sensor_type, s.unit, sd.reading_value, 
             DATE_FORMAT(sd.recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at
      FROM sensor_data sd
      JOIN sensor s ON sd.sensor_id = s.sensor_id
      ORDER BY sd.data_id DESC LIMIT 50
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/actions', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ah.action_id, d.device_name, u.user_name, ah.action, ah.status, 
             DATE_FORMAT(ah.executed_at, '%Y-%m-%d %H:%i:%s') AS executed_at
      FROM action_history ah
      JOIN device d ON ah.device_id = d.device_id
      JOIN \`user\` u ON ah.user_id = u.user_id
      ORDER BY ah.action_id DESC LIMIT 50
    `);
    res.json(rows);
  } catch (e) {
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

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`[HTTP Server] Running at: http://localhost:${PORT}`);
});