const pool = require('../config/db');
const { mqttClient, TOPIC_CONTROL } = require('../config/mqtt');

exports.getDevices = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM device');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.controlDevice = async (req, res) => {
  const { deviceId, action } = req.body;

  if (!deviceId || !action) {
    return res.status(400).json({ message: 'Thiếu deviceId hoặc action!' });
  }

  try {
    const statusVal = action.toUpperCase() === 'ON' ? 1 : 0;
    await pool.query('UPDATE device SET status = ? WHERE device_id = ?', [statusVal, deviceId]);

    const payload = JSON.stringify({
      deviceId: Number(deviceId),
      action: action.toUpperCase()
    });

    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(TOPIC_CONTROL, payload, (err) => {
        if (!err) {
          console.log(`[MQTT Sent] Da ban xuong Arduino: ${payload}`);
        } else {
          console.error('[MQTT Sent Failed]', err);
        }
      });
    } else {
      console.warn('[MQTT Warn] Broker chua connected, khong the publish!');
    }

    console.log(`[Device Control] User ${req.user.username} set Device ${deviceId} to ${action}`);

    return res.json({
      success: true,
      message: `Đã thực hiện lệnh ${action} cho thiết bị ${deviceId}`,
      data: { deviceId, action }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};