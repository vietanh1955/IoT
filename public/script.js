const socket = io();

// 1. Chuyển đổi Tab SPA
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');
}

// 2. Cấu hình Chart.js
let currentTimeframe = 'realtime';

const realtimeChartData = {
  labels: [],
  temp: [],
  hum: [],
  light: []
};

const staticData = {
  '1h': {
    labels: ['14:00', '14:10', '14:20', '14:30', '14:40', '14:50', '15:00'],
    temp: [26.5, 27.0, 27.8, 28.2, 28.5, 28.3, 28.0],
    hum: [68.0, 67.2, 66.0, 65.5, 65.0, 65.3, 66.1],
    light: [380, 410, 430, 450, 460, 440, 400]
  },
  '24h': {
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    temp: [22, 24, 20, 26, 28.5, 23, 25],
    hum: [60, 55, 65, 50, 65, 62, 60],
    light: [30, 20, 50, 80, 450, 40, 30]
  }
};

const ctx = document.getElementById('mainChart').getContext('2d');
const mainChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Temp (°C)', data: [], borderColor: '#EF4444', backgroundColor: '#EF4444', tension: 0.3 },
      { label: 'Humidity (%)', data: [], borderColor: '#38BDF8', backgroundColor: '#38BDF8', tension: 0.3 },
      { label: 'Light (Lux)', data: [], borderColor: '#F59E0B', backgroundColor: '#F59E0B', tension: 0.3 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { grid: { color: '#334155' }, ticks: { color: '#94A3B8' } },
      x: { grid: { color: '#334155' }, ticks: { color: '#94A3B8' } }
    },
    plugins: {
      legend: { labels: { color: '#F8FAFC' } }
    }
  }
});

function changeChartTimeframe(type) {
  currentTimeframe = type;
  document.querySelectorAll('.btn-time').forEach(btn => btn.classList.remove('active'));
  
  if (type === 'realtime') {
    document.getElementById('btn-time-realtime').classList.add('active');
    mainChart.data.labels = [...realtimeChartData.labels];
    mainChart.data.datasets[0].data = [...realtimeChartData.temp];
    mainChart.data.datasets[1].data = [...realtimeChartData.hum];
    mainChart.data.datasets[2].data = [...realtimeChartData.light];
  } else {
    document.getElementById(`btn-time-${type}`).classList.add('active');
    const selected = staticData[type];
    mainChart.data.labels = [...selected.labels];
    mainChart.data.datasets[0].data = [...selected.temp];
    mainChart.data.datasets[1].data = [...selected.hum];
    mainChart.data.datasets[2].data = [...selected.light];
  }
  mainChart.update();
}

// 3. Quản lý dữ liệu ban đầu
let sensorRows = [];
let actionRows = [];

async function loadInitialData() {
  try {
    const [resSensors, resActions, resDevs] = await Promise.all([
      fetch('/api/sensors').then(r => r.json()),
      fetch('/api/actions').then(r => r.json()),
      fetch('/api/devices').then(r => r.json())
    ]);

    sensorRows = resSensors.map(s => ({
      id: `#S${s.data_id}`,
      type: s.sensor_type,
      value: `${s.reading_value} ${s.unit || ''}`,
      time: s.recorded_at || ''
    }));

    actionRows = resActions.map(a => ({
      id: `#ACT-${a.action_id}`,
      action_id: a.action_id,
      device: a.device_name,
      action: a.action,
      status: a.status,
      time: a.executed_at || ''
    }));

    // Cập nhật công tắc chính xác theo DB
    resDevs.forEach(dev => {
      const toggle = document.getElementById(`toggle-${dev.device_id}`);
      const statusText = document.getElementById(`status-text-${dev.device_id}`);
      const isOn = Number(dev.status) === 1;
      
      if (toggle) toggle.checked = isOn;
      if (statusText) statusText.innerText = `Status: ${isOn ? 'ON' : 'OFF'}`;
    });

    filterSensorTable();
    filterActionTable();
    renderTechStack();
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

// 4. Lọc Bảng Sensor Logs
function filterSensorTable() {
  const search = document.getElementById('sensorSearch').value.toLowerCase();
  const type = document.getElementById('sensorTypeFilter').value;
  const tbody = document.getElementById('sensorTableBody');
  tbody.innerHTML = '';

  sensorRows.forEach(row => {
    if ((type === 'All' || row.type === type) && row.time.includes(search)) {
      let badgeCls = row.type === 'Temperature' ? 'badge-red' : (row.type === 'Humidity' ? 'badge-blue' : 'badge-yellow');
      tbody.innerHTML += `
        <tr>
          <td class="text-blue">${row.id}</td>
          <td><span class="badge ${badgeCls}">${row.type}</span></td>
          <td><strong>${row.value}</strong></td>
          <td>${row.time}</td>
        </tr>
      `;
    }
  });
}

// 5. Lọc Bảng Action History (Đầy đủ Filter Device, Action, Status)
function filterActionTable() {
  const search = document.getElementById('actionSearch').value.toLowerCase();
  const dev = document.getElementById('actionDeviceFilter').value;
  const act = document.getElementById('actionTypeFilter').value;
  const status = document.getElementById('actionStatusFilter').value;
  const tbody = document.getElementById('actionTableBody');
  tbody.innerHTML = '';

  actionRows.forEach(row => {
    const matchTime = row.time.includes(search);
    const matchDev = (dev === 'All' || row.device === dev);
    const matchAct = (act === 'All' || row.action === act);
    const matchStatus = (status === 'All' || row.status === status);

    if (matchTime && matchDev && matchAct && matchStatus) {
      let statCls = row.status === 'SUCCESS' ? 'badge-green' : (row.status === 'FAILED' ? 'badge-red' : 'badge-blue');
      tbody.innerHTML += `
        <tr>
          <td class="text-blue">${row.id}</td>
          <td>${row.device}</td>
          <td><span class="badge ${row.action === 'ON' ? 'badge-green' : 'badge-red'}">${row.action}</span></td>
          <td><span class="badge ${statCls}">${row.status}</span></td>
          <td>${row.time}</td>
        </tr>
      `;
    }
  });
}

// 6. Điều khiển Relay (Chống Spam / Debounce Switch 400ms)
function handleToggle(deviceId, isChecked) {
  const toggle = document.getElementById(`toggle-${deviceId}`);
  const statusText = document.getElementById(`status-text-${deviceId}`);
  const action = isChecked ? 'ON' : 'OFF';

  // Cập nhật text UI ngay
  if (statusText) statusText.innerText = `Status: ${action}`;

  // Khóa switch tạm thời trong 400ms để đảm bảo DB và MQTT xử lý xong trật tự
  if (toggle) toggle.disabled = true;
  setTimeout(() => {
    if (toggle) toggle.disabled = false;
  }, 400);

  // Gửi socket xuống server
  socket.emit('send_control', { deviceId, action });
}

// 7. Nhận Telemetry & Append Sensor Data
socket.on('sensor_telemetry', (data) => {
  document.getElementById('dash-temp').innerHTML = `${data.temperature} <span>°C</span>`;
  document.getElementById('dash-hum').innerHTML = `${data.humidity} <span>%</span>`;
  document.getElementById('dash-light').innerHTML = `${data.light} <span>Lux</span>`;

  const timeLabel = data.time.split(' ')[1] || data.time;
  if (realtimeChartData.labels.length >= 8) {
    realtimeChartData.labels.shift();
    realtimeChartData.temp.shift();
    realtimeChartData.hum.shift();
    realtimeChartData.light.shift();
  }
  realtimeChartData.labels.push(timeLabel);
  realtimeChartData.temp.push(data.temperature);
  realtimeChartData.hum.push(data.humidity);
  realtimeChartData.light.push(data.light);

  if (currentTimeframe === 'realtime') {
    mainChart.data.labels = [...realtimeChartData.labels];
    mainChart.data.datasets[0].data = [...realtimeChartData.temp];
    mainChart.data.datasets[1].data = [...realtimeChartData.hum];
    mainChart.data.datasets[2].data = [...realtimeChartData.light];
    mainChart.update();
  }

  sensorRows.unshift(
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Temperature', value: `${data.temperature} °C`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Humidity', value: `${data.humidity} %`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Ambient Light', value: `${data.light} Lux`, time: data.time }
  );
  filterSensorTable();
});

// Append Action mới vào bảng
socket.on('action_logged', (data) => {
  actionRows.unshift({
    id: `#ACT-${data.action_id}`,
    action_id: data.action_id,
    device: data.device_name,
    action: data.action,
    status: data.status,
    time: data.executed_at
  });
  filterActionTable();
});

// 8. LOGIC CRUD TECH STACK (Profile Tab)
const defaultTechs = ['ESP32', 'Mosquitto MQTT', 'Node.js', 'MySQL', 'REST API', 'WebSocket'];

function getTechs() {
  const saved = localStorage.getItem('user_tech_stack');
  return saved ? JSON.parse(saved) : defaultTechs;
}

function saveTechs(techs) {
  localStorage.setItem('user_tech_stack', JSON.stringify(techs));
}

function renderTechStack() {
  const container = document.getElementById('techStackContainer');
  if (!container) return;
  const techs = getTechs();
  container.innerHTML = techs.map((tech, idx) => `
    <span class="tech-tag-item">
      ${tech}
      <span class="tech-tag-remove" onclick="removeTechStack(${idx})" title="Remove skill">×</span>
    </span>
  `).join('');
}

function addTechStack() {
  const input = document.getElementById('newTechInput');
  const val = input.value.trim();
  if (!val) return;
  
  const techs = getTechs();
  if (!techs.includes(val)) {
    techs.push(val);
    saveTechs(techs);
    renderTechStack();
  }
  input.value = '';
}

function removeTechStack(idx) {
  const techs = getTechs();
  techs.splice(idx, 1);
  saveTechs(techs);
  renderTechStack();
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('newTechInput');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addTechStack();
    });
  }
});

loadInitialData();