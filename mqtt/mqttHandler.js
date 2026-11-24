const pool = require('../config/db');
const { 
  mqttClient, 
  TOPIC_SENSOR, 
  TOPIC_CONTROL, 
  TOPIC_RESPONSE, 
  TOPIC_SYNC 
} = require('../config/mqtt');
const { getVNTimeString } = require('../utils/timeUtil');
const { pendingActions, executeDeviceControl } = require('../services/deviceService');

module.exports = function initMqttHandler(io) {
  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected successfully to HiveMQ Broker');
    mqttClient.subscribe([TOPIC_SENSOR, TOPIC_RESPONSE, TOPIC_SYNC]);
  });

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
        const tempVal  = parseFloat(data.temperature) || 0;
        const humVal   = parseFloat(data.humidity) || 0;
        const lightVal = parseInt(data.light, 10) || 0;
        const windVal  = parseFloat(data.wind) || 0;
        const timeStr  = getVNTimeString();

        await pool.query(
          `INSERT INTO sensor_data (sensor_id, reading_value, recorded_at) 
           VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
          [
            1, tempVal, timeStr,
            2, humVal, timeStr,
            3, lightVal, timeStr,
            4, windVal, timeStr
          ]
        );

        io.emit('sensor_telemetry', {
          temperature: tempVal,
          humidity: humVal,
          light: lightVal,
          wind: windVal,
          time: timeStr
        });

        const LIGHT_LIMIT = 50;
        if (lightVal < LIGHT_LIMIT) {
          io.emit('alert_trigger', {
            type: 'LOW_LIGHT',
            message: `Low ambient light (${lightVal} Lux < ${LIGHT_LIMIT} Lux). Auto turning ON Relay Light!`,
            value: lightVal
          });

          const [lightDev] = await pool.query('SELECT status FROM device WHERE device_id = 2');
          if (lightDev.length && Number(lightDev[0].status) === 0 && !pendingActions.has('2_ON')) {
            await executeDeviceControl(io, 2, 'ON', 'AUTO');
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
};