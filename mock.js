const mqtt = require('mqtt');

const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const TOPIC_CONTROL  = 'vanh_iot/device_control';
const TOPIC_RESPONSE = 'vanh_iot/device_response';

const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
  console.log('[Mock Device] Đã kết nối broker HiveMQ. Đang lắng nghe lệnh bật/tắt...');
  client.subscribe(TOPIC_CONTROL);
});

client.on('message', (topic, message) => {
  if (topic === TOPIC_CONTROL) {
    try {
      const data = JSON.parse(message.toString());
      console.log(`[Mock Device] Nhận lệnh từ Server: Thiết bị ${data.deviceId} -> ${data.action}`);

      // Giả lập độ trễ phần cứng thực thi (khoảng 300ms) rồi gửi xác nhận thành công
      setTimeout(() => {
        const payload = JSON.stringify({
          deviceId: data.deviceId,
          action: data.action,
          status: 'SUCCESS'
        });

        client.publish(TOPIC_RESPONSE, payload);
        console.log(`[Mock Device] Đã gửi phản hồi SUCCESS về topic "${TOPIC_RESPONSE}"`);
      }, 300);
    } catch (e) {
      console.error('Lỗi parse message:', e.message);
    }
  }
});