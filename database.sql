CREATE DATABASE IF NOT EXISTS iot_lab;
USE iot_lab;

CREATE TABLE IF NOT EXISTS `user` (
    user_id INT(10) AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device (
    device_id INT(10) AUTO_INCREMENT PRIMARY KEY,
    device_name VARCHAR(50) NULL,
    pin INT(10) NOT NULL,
    status TINYINT(1) DEFAULT 0, -- 0: OFF, 1: ON
    last_connected TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor (
    sensor_id INT(10) AUTO_INCREMENT PRIMARY KEY,
    sensor_type VARCHAR(50) NOT NULL,
    unit VARCHAR(50) NULL
);

CREATE TABLE IF NOT EXISTS sensor_data (
    data_id BIGINT(19) AUTO_INCREMENT PRIMARY KEY,
    sensor_id INT(10) NOT NULL,
    reading_value FLOAT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensor(sensor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_history (
    action_id INT(10) AUTO_INCREMENT PRIMARY KEY,
    device_id INT(10) NOT NULL,
    user_id INT(10) NOT NULL,
    action VARCHAR(50) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10) NOT NULL, -- SUCCESS, LOADING, FAILED
    FOREIGN KEY (device_id) REFERENCES device(device_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES `user`(user_id) ON DELETE CASCADE
);

INSERT INTO `user` (user_id, user_name, password_hash, email) VALUES
(1, 'Trần Việt Anh', 'hash_pass_b23dcat021', 'B23AT021@stu.ptit.edu.vn')
ON DUPLICATE KEY UPDATE user_name = VALUES(user_name);

INSERT INTO device (device_id, device_name, pin, status) VALUES
(1, 'Relay Fan 01', 14, 1),
(2, 'Relay Light 01', 12, 0)
ON DUPLICATE KEY UPDATE device_name = VALUES(device_name);

INSERT INTO sensor (sensor_id, sensor_type, unit) VALUES
(1, 'Temperature', '°C'),
(2, 'Humidity', '%'),
(3, 'Ambient Light', 'Lux')
ON DUPLICATE KEY UPDATE sensor_type = VALUES(sensor_type);