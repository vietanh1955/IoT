const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    const token = jwt.sign({ username: 'admin' }, 'vanh_secret_key_123', { expiresIn: '1d' });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });
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