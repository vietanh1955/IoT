const pool = require('../config/db');
const { mqttClient, TOPIC_CONTROL } = require('../config/mqtt');
const { getVNTimeString } = require('../utils/timeUtil');

const pendingActions = new Map();

async function executeDeviceControl(io, devId, act, origin = 'MANUAL') {
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

module.exports = {
  pendingActions,
  executeDeviceControl
};