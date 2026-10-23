const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Thiếu Token!' });

  jwt.verify(token, 'vanh_secret_key_123', (err, user) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ!' });
    req.user = user;
    next();
  });
};