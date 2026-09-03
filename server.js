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

// 1. Kết nối CSDL MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'VanH1905', 
  database: 'iot_lab',
  waitForConnections: true,
  connectionLimit: 10
});

// 2. Cấu hình MQTT Broker HiveMQ & Topic Đồng bộ
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SENSOR   = 'iot_ptit/data_sensor';
const TOPIC_CONTROL  = 'iot_ptit/device_control';
const TOPIC_RESPONSE = 'iot_ptit/device_response';
const TOPIC_SYNC     = 'iot_ptit/device_sync'; // TOPIC ĐỒNG BỘ TRẠNG THÁI

const mqttClient = mqtt.connect(MQTT_BROKER);
const pendingActions = new Map();

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected successfully to HiveMQ Broker');
  mqttClient.subscribe([TOPIC_SENSOR, TOPIC_RESPONSE, TOPIC_SYNC]);
});

// Hàm dùng chung để kích hoạt gửi lệnh điều khiển (cho cả Socket và Tự động hóa)
async function executeDeviceControl(devId, act, origin = 'MANUAL') {
  const currentUserId = 1;
  const timeStr = getVNTimeString();

  const [devRows] = await pool.query('SELECT device_name, status FROM device WHERE device_id = ?', [devId]);
  const devName = devRows.length ? devRows[0].device_name : `Device ${devId}`;
  const previousStatus = devRows.length ? Number(devRows[0].status) : 0;

  // Ghi nhận bản ghi LOADING vào action_history
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

  // Gửi lệnh MQTT đến ESP8266
  mqttClient.publish(TOPIC_CONTROL, JSON.stringify({ deviceId: parseInt(devId), action: act }));

  // Thiết lập Timeout 3.5s kiểm tra phản hồi
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

      // KHÔI PHỤC TRẠNG THÁI CŨ TRONG DB NẾU THẤT BẠI
      await pool.query('UPDATE device SET status = ? WHERE device_id = ?', [previousStatus, devId]);

      // ĐỒNG BỘ NÚT BẬT/TẮT TRÊN GIAO DIỆN VỀ TRẠNG THÁI CŨ
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

    // 0. ESP8266 VỪA CẮM ĐIỆN VÀ GỬI YÊU CẦU ĐỒNG BỘ LẠI TRẠNG THÁI RELAY
    if (topic === TOPIC_SYNC) {
      console.log('[MQTT Sync Request] ESP8266 connected. Pushing DB device states to board...');
      const [devices] = await pool.query('SELECT device_id, status FROM device');
      
      devices.forEach(dev => {
        const act = Number(dev.status) === 1 ? 'ON' : 'OFF';
        // Bắn trực tiếp trạng thái hiện tại từ DB xuống để mạch kéo relay tương ứng
        mqttClient.publish(TOPIC_CONTROL, JSON.stringify({
          deviceId: parseInt(dev.device_id),
          action: act
        }));
      });
      return;
    }

    // 1. Nhận dữ liệu cảm biến
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

      // CHỨC NĂNG ALERT VƯỢT NGƯỠNG ÁNH SÁNG (< 50 LUX) & TỰ ĐỘNG BẬT ĐÈN (DEVICE 2)
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

    // 2. Nhận phản hồi ACK từ mạch ESP8266
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

// 3. Socket.io nhận lệnh điều khiển thủ công từ người dùng
io.on('connection', (socket) => {
  socket.on('send_control', async (payload) => {
    const devId = String(payload.deviceId);
    const act = String(payload.action).toUpperCase();
    await executeDeviceControl(devId, act, 'MANUAL');
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