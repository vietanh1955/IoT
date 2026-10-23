const mqtt = require('mqtt');

const MQTT_BROKER    = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SENSOR   = 'vanh_iot/data_sensor';
const TOPIC_CONTROL  = 'vanh_iot/device_control';
const TOPIC_RESPONSE = 'vanh_iot/device_response';
const TOPIC_SYNC     = 'vanh_iot/device_sync';

const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: 'backend_node_' + Math.random().toString(16).substring(2, 10),
  clean: true,
  reconnectPeriod: 1000
});

mqttClient.on('connect', () => {
  console.log('[MQTT Info] Backend da KET NOI THANH CONG toi HiveMQ Broker!');
});

mqttClient.on('error', (err) => {
  console.error('[MQTT Error] Loi ket noi:', err.message);
});

module.exports = {
  mqttClient,
  TOPIC_SENSOR,
  TOPIC_CONTROL,
  TOPIC_RESPONSE,
  TOPIC_SYNC
};