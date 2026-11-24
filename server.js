const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('json spaces', 4);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu username hoặc password' 
    });
  }

  try {
    // 1. Tìm tài khoản trong bảng `user` theo cột `user_name`
    const [rows] = await pool.query(
      'SELECT user_id, user_name, password_hash, email FROM user WHERE user_name = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Tài khoản không tồn tại!' 
      });
    }

    const user = rows[0];

    // 2. Kiểm tra mật khẩu (so khớp với password_hash trong CSDL)
    if (user.password_hash !== password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Mật khẩu không chính xác!' 
      });
    }

    // 3. Ký JWT Token kèm user_id và user_name thực tế
    const token = jwt.sign(
      { 
        user_id: user.user_id, 
        username: user.user_name,
        email: user.email 
      },
      'vanh_secret_key_123',
      { expiresIn: '1d' }
    );

    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token
    });
  } catch (error) {
    console.error('[Login Error]:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.use('/api/sensors', require('./routes/sensorRoutes'));
app.use('/api/actions', require('./routes/actionRoutes'));
app.use('/api/devices', require('./routes/deviceRoutes'));

require('./sockets/socketHandler')(io);
require('./mqtt/mqttHandler')(io);

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`[HTTP Server] Running at: http://localhost:${PORT}`);
});