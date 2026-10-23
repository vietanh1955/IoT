# Hướng dẫn Dự án IoT Giám Sát Cảm Biến & Điều Khiển Thiết Bị

Hệ thống IoT hoàn chỉnh tích hợp Node.js Backend, giao thức MQTT (HiveMQ Broker), bảo mật bằng JSON Web Token (JWT) và vi điều khiển ESP8266 điều khiển LED/Relay.

---

## 📌 Kiến Trúc Hoạt Động

```
[ESP8266 + Cảm biến / LED] 
        │
   (MQTT qua TCP/1883)
        ▼
[HiveMQ Public Broker] 
        ▲
   (MQTT qua TCP/1883)
        │
[Node.js Backend] ◄─── (HTTP REST API + JWT) ───► [Client / Postman]
        │
  (MySQL Pool)
        ▼
   [MySQL Database]
```

---

## 🛠 Phần Cứng & Sơ Đồ Chân (ESP8266)

| Thiết bị / Module | Chân trên Module | Chân kết nối ESP8266 | Device ID | Chức năng |
| :--- | :--- | :--- | :---: | :--- |
| **Cảm biến DHT11** | DATA | `D2` (GPIO 4) | - | Đo nhiệt độ & độ ẩm môi trường |
| **Quang trở LDR** | Tín hiệu Analog | `A0` (ADC0) | - | Đo cường độ ánh sáng |
| **LED Nhiệt độ** | Chân dương (+) | `D5` (GPIO 14) | `1` | Điều khiển cảnh báo nhiệt độ |
| **LED Độ ẩm** | Chân dương (+) | `D6` (GPIO 12) | `2` | Điều khiển cảnh báo độ ẩm |
| **LED Ánh sáng** | Chân dương (+) | `D7` (GPIO 13) | `3` | Điều khiển cảnh báo ánh sáng |

---

## 📡 Cấu Trúc MQTT Topics & Payloads

* **Broker:** `broker.hivemq.com:1883`

### 1. ESP8266 gửi dữ liệu cảm biến (Chu kỳ 2 giây/lần)
* **Topic:** `vanh_iot/data_sensor`
* **Payload mẫu:**
```json
{
  "temperature": 28.5,
  "humidity": 65.0,
  "light": 420
}
```

### 2. Backend bắn lệnh điều khiển xuống ESP8266
* **Topic:** `vanh_iot/device_control`
* **Payload mẫu:**
```json
{
  "deviceId": 1,
  "action": "ON"
}
```
*(Hỗ trợ `action`: `"ON"` hoặc `"OFF"`)*

### 3. ESP8266 phản hồi trạng thái hoàn thành (ACK)
* **Topic:** `vanh_iot/device_response`
* **Payload mẫu:**
```json
{
  "deviceId": 1,
  "action": "ON",
  "status": "SUCCESS"
}
```

---

## 🚀 Cài Đặt & Khởi Động

### 1. Cơ sở dữ liệu MySQL
Tạo bảng thiết bị cơ bản:
```sql
CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

CREATE TABLE IF NOT EXISTS device (
  device_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status TINYINT(1) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO device (device_id, name, status) VALUES 
(1, 'LED Nhiệt độ', 0),
(2, 'LED Độ ẩm', 0),
(3, 'LED Ánh sáng', 0)
ON DUPLICATE KEY UPDATE name=VALUES(name);
```

### 2. Khởi chạy Backend
```bash
# Cài đặt các package cần thiết
npm install express mqtt jsonwebtoken mysql2 cors socket.io swagger-ui-express

# Chạy server
node server.js
```
Khi chạy thành công, Terminal sẽ xuất hiện:
```text
[HTTP Server] Running at: http://localhost:5000
[MQTT Info] Backend da KET NOI THANH CONG toi HiveMQ Broker!
```

---

## 🔐 Hướng Dẫn Kiểm Thử API Bằng Postman

Mọi thao tác điều khiển thiết bị đều được bảo vệ bởi middleware xác thực JWT với secret key: `vanh_secret_key_123`.

### Bước 1: Đăng nhập lấy Token

* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/login`
* **Headers:**
  * `Content-Type`: `application/json`
* **Body (raw JSON):**
```json
{
  "username": "admin",
  "password": "123456"
}
```
* **Response trả về:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

👉 **Copy toàn bộ chuỗi `token`** nhận được (bắt đầu bằng `eyJ...`).

---

### Bước 2: Điều khiển thiết bị (Bật/Tắt)

* **Method:** `POST`
* **URL:** `http://localhost:5000/api/devices/control`
* **Authorization:**
  * **Type:** `Bearer Token`
  * **Token:** `<Dán trực tiếp chuỗi token vừa copy>`
* **Headers:**
  * `Content-Type`: `application/json`
* **Body (raw JSON):**
```json
{
  "deviceId": 1,
  "action": "ON"
}
```
*(Thay `"ON"` bằng `"OFF"` để tắt thiết bị)*

* **Response trả về (200 OK):**
```json
{
  "success": true,
  "message": "Đã thực hiện lệnh ON cho thiết bị 1",
  "data": {
    "deviceId": 1,
    "action": "ON"
  }
}
```

---

## 🎯 Kết Quả Hoạt Động Thực Tế

1. **Terminal Backend:**
   ```text
   [MQTT Sent] Da ban xuong Arduino: {"deviceId":1,"action":"ON"}
   [Device Control] User admin set Device 1 to ON
   [MQTT Response received]: { deviceId: 1, action: 'ON', status: 'SUCCESS' }
   ```
2. **Serial Monitor ESP8266:**
   ```text
   [MQTT Inbound] Payload: {"deviceId":1,"action":"ON"}
   [Control] Device 1 set to ON (Pin 14)
   [MQTT Outbound] Published ACK response
   ```
3. **Phần cứng:** LED chân D5 (Device 1) sáng lên tương ứng với lệnh điều khiển.