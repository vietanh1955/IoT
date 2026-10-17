const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'VanH1905', 
  database: 'iot_lab',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;