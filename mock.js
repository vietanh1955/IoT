const mqtt = require('mqtt');

const MQTT_BROKER    = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SENSOR   = 'vanh_iot/data_sensor';
const TOPIC_CONTROL  = 'vanh_iot/device_control';
const TOPIC_RESPONSE = 'vanh_iot/device_response';
const TOPIC_SYNC     = 'vanh_iot/device_sync';

const client = mqtt.connect(MQTT_BROKER, {
  clientId: 'esp8266_sim_' + Math.random().toString(16).substring(2, 10)
});

let currentTemp  = 28.5;
let currentHum   = 65.0;
let currentLight = 725;
let currentWind  = 8.5;

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

client.on('connect', () => {
  console.log('[ESP8266 Sim] Da ket noi HiveMQ Broker!');
  client.subscribe(TOPIC_CONTROL);
  client.publish(TOPIC_SYNC, JSON.stringify({ status: 'BOOT' }));

  setInterval(() => {
    currentTemp  = Number(clamp(currentTemp + (Math.random() * 0.6 - 0.3), 24.0, 35.0).toFixed(1));
    currentHum   = Number(clamp(currentHum + (Math.random() * 1.4 - 0.7), 50.0, 85.0).toFixed(1));
    currentLight = Math.round(clamp(currentLight + (Math.floor(Math.random() * 7) - 3), 700, 750));
    currentWind  = Number(clamp(currentWind + (Math.floor(Math.random() * 13) - 6) / 10, 3.0, 20.0).toFixed(1));

    const payload = JSON.stringify({
      temperature: currentTemp,
      humidity: currentHum,
      light: currentLight,
      wind: currentWind
    });

    client.publish(TOPIC_SENSOR, payload);
    console.log(`[Publish] ${TOPIC_SENSOR} -> ${payload}`);
  }, 2000);
});

client.on('message', (topic, message) => {
  if (topic === TOPIC_CONTROL) {
    const data = JSON.parse(message.toString());
    console.log(`[Control] Device ${data.deviceId} -> ${data.action}`);

    setTimeout(() => {
      const ack = JSON.stringify({
        deviceId: Number(data.deviceId),
        action: String(data.action).toUpperCase(),
        status: 'SUCCESS'
      });
      client.publish(TOPIC_RESPONSE, ack);
      console.log(`[ACK] ${TOPIC_RESPONSE} -> ${ack}`);
    }, 300);
  }
});