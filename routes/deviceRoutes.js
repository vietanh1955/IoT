const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', deviceController.getDevices);
router.post('/control', authMiddleware, deviceController.controlDevice);

module.exports = router;