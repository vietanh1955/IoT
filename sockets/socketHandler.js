const { executeDeviceControl } = require('../services/deviceService');

module.exports = function initSocketHandler(io) {
  io.on('connection', (socket) => {
    socket.on('send_control', async (payload) => {
      const devId = String(payload.deviceId);
      const act = String(payload.action).toUpperCase();
      await executeDeviceControl(io, devId, act, 'MANUAL');
    });
  });
};