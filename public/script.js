// 1. Cấu hình toàn cục & Kết nối WebSocket
const socket = io(); 

const ROWS_PER_PAGE = 20; 
let currentSensorPage = 1; 
let currentActionPage = 1; 

let sensorRows = []; 
let actionRows = []; 
let filteredSensors = []; 
let filteredActions = []; 

// Chuyển đổi tab điều hướng Single Page Application (SPA)
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); // Ẩn tất cả tab
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active')); // Tắt sáng các nút sidebar

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  const targetBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add('active'); // Làm sáng nút menu tương ứng

  localStorage.setItem('active_iot_tab', tabId);
}

// Tạo thông báo nổi (Toast Notification) ở góc màn hình
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) { // Tự sinh container nếu chưa tồn tại
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerText = message;
  toastContainer.appendChild(toast);

  // Tự hủy thông báo sau 4 giây
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 2. Trang Dashboard (Cards, Chart.js & Relay Control)
let currentTimeframe = 'realtime'; // Cờ lưu trạng thái xem biểu đồ

// Bộ đệm lưu tối đa 8 điểm đo phục vụ hiệu ứng trượt realtime
const realtimeChartData = {
  labels: [],
  temp: [],
  hum: [],
  light: []
};

// Khởi tạo đồ thị đường đa trục Chart.js
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

// Gọi API lấy dữ liệu lịch sử đã gom nhóm AVG từ Database (1h hoặc 24h)
async function loadChartHistory(timeframe) {
  try {
    const res = await fetch(`/api/sensors/history?range=${timeframe}`);
    const rows = await res.json();

    // Map dữ liệu từ database vào bảng tra cứu
    const dataMap = { 'Temperature': {}, 'Humidity': {}, 'Ambient Light': {} };
    rows.forEach(item => {
      if (dataMap[item.sensor_type]) {
        dataMap[item.sensor_type][item.time_label] = item.avg_value;
      }
    });

    const labels = [];
    const now = new Date();

    if (timeframe === '24h') {
      // Tự sinh đủ 24 mốc giờ tính lùi từ giờ hiện tại về 24 tiếng trước
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hh = String(d.getHours()).padStart(2, '0');
        labels.push(`${hh}:00`);
      }
    } else if (timeframe === '1h') {
      // Tự sinh 12 mốc (mỗi mốc 5 phút) tính lùi trong 1 tiếng qua
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 5 * 60 * 1000);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0');
        labels.push(`${hh}:${mm}`);
      }
    }

    // Gán nhãn trục hoành và ánh xạ dữ liệu (khung giờ nào chưa bật mạch sẽ tự nhận null)
    mainChart.data.labels = labels;
    mainChart.data.datasets[0].data = labels.map(lbl => dataMap['Temperature'][lbl] ?? null);
    mainChart.data.datasets[1].data = labels.map(lbl => dataMap['Humidity'][lbl] ?? null);
    mainChart.data.datasets[2].data = labels.map(lbl => dataMap['Ambient Light'][lbl] ?? null);
    
    mainChart.update();
  } catch (err) {
    console.error('Lỗi tải dữ liệu lịch sử chart:', err);
  }
}

// Chuyển đổi giữa chế độ realtime trượt và xem lịch sử tổng hợp 1h / 24h từ Database
async function changeChartTimeframe(type) {
  currentTimeframe = type;
  document.querySelectorAll('.btn-time').forEach(btn => btn.classList.remove('active'));

  if (type === 'realtime') {
    document.getElementById('btn-time-realtime').classList.add('active');
    mainChart.data.labels = [...realtimeChartData.labels];
    mainChart.data.datasets[0].data = [...realtimeChartData.temp];
    mainChart.data.datasets[1].data = [...realtimeChartData.hum];
    mainChart.data.datasets[2].data = [...realtimeChartData.light];
    mainChart.update();
  } else {
    document.getElementById(`btn-time-${type}`).classList.add('active');
    await loadChartHistory(type);
  }
}

// Gửi lệnh điều khiển công tắc Relay lên máy chủ
function handleToggle(deviceId, isChecked) {
  const toggle = document.getElementById(`toggle-${deviceId}`);
  const statusText = document.getElementById(`status-text-${deviceId}`);
  const action = isChecked ? 'ON' : 'OFF';

  if (statusText) statusText.innerText = `Status: ${action} (Pending...)`;
  if (toggle) toggle.disabled = true; // Khóa công tắc chống spam click liên tục

  socket.emit('send_control', { deviceId, action });
}

// 3. Trang Sensor Data (Lọc & Phân trang)
// Lọc dữ liệu mảng sensor theo từ khóa thời gian và loại cảm biến
function filterSensorTable(resetPage = true) {
  if (resetPage) currentSensorPage = 1;

  const search = document.getElementById('sensorSearch').value.toLowerCase();
  const type = document.getElementById('sensorTypeFilter').value;

  filteredSensors = sensorRows.filter(row => {
    const matchType = (type === 'All' || row.type === type);
    const matchTime = row.time.toLowerCase().includes(search);
    return matchType && matchTime;
  });

  renderSensorPagination();
}

// Cắt dữ liệu 20 bản ghi của trang hiện tại và sinh HTML cho bảng Sensor
function renderSensorPagination() {
  const tbody = document.getElementById('sensorTableBody');
  tbody.innerHTML = '';

  const totalEntries = filteredSensors.length;
  const totalPages = Math.ceil(totalEntries / ROWS_PER_PAGE) || 1;

  if (currentSensorPage > totalPages) currentSensorPage = totalPages;
  if (currentSensorPage < 1) currentSensorPage = 1;

  const startIndex = (currentSensorPage - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, totalEntries);
  const pageItems = filteredSensors.slice(startIndex, endIndex);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Không có dữ liệu phù hợp</td></tr>`;
  } else {
    pageItems.forEach(row => {
      let badgeCls = row.type === 'Temperature' ? 'badge-red' : (row.type === 'Humidity' ? 'badge-blue' : 'badge-yellow');
      tbody.innerHTML += `
        <tr>
          <td class="text-blue">${row.id}</td>
          <td><span class="badge ${badgeCls}">${row.type}</span></td>
          <td><strong>${row.value}</strong></td>
          <td>${row.time}</td>
        </tr>
      `;
    });
  }

  const infoEl = document.getElementById('sensorPageInfo');
  const pageEl = document.getElementById('sensorPageCurrent');
  const btnPrev = document.getElementById('sensorBtnPrev');
  const btnNext = document.getElementById('sensorBtnNext');

  if (infoEl) infoEl.innerText = totalEntries > 0 ? `Showing ${startIndex + 1}-${endIndex} of ${totalEntries} entries` : 'Showing 0 of 0 entries';
  if (pageEl) pageEl.innerText = currentSensorPage;
  if (btnPrev) btnPrev.disabled = (currentSensorPage <= 1);
  if (btnNext) btnNext.disabled = (currentSensorPage >= totalPages || totalEntries === 0);
}

// Thay đổi chỉ số trang (+1 hoặc -1) khi bấm nút Previous hoặc Next bảng Sensor
function changeSensorPage(step) {
  currentSensorPage += step;
  renderSensorPagination();
}

// 4. Trang Action History (Lọc & Phân trang)
// Lọc mảng lịch sử theo 4 trường điều kiện kết hợp
function filterActionTable(resetPage = true) {
  if (resetPage) currentActionPage = 1;

  const search = document.getElementById('actionSearch').value.toLowerCase();
  const dev = document.getElementById('actionDeviceFilter').value;
  const act = document.getElementById('actionTypeFilter').value;
  const status = document.getElementById('actionStatusFilter').value;

  filteredActions = actionRows.filter(row => {
    const matchTime = row.time.toLowerCase().includes(search);
    const matchDev = (dev === 'All' || row.device === dev);
    const matchAct = (act === 'All' || row.action === act);
    const matchStatus = (status === 'All' || row.status === status);
    return matchTime && matchDev && matchAct && matchStatus;
  });

  renderActionPagination();
}

// Cắt dữ liệu 20 bản ghi của trang hiện tại và sinh HTML cho bảng Action
function renderActionPagination() {
  const tbody = document.getElementById('actionTableBody');
  tbody.innerHTML = '';

  const totalEntries = filteredActions.length;
  const totalPages = Math.ceil(totalEntries / ROWS_PER_PAGE) || 1;

  if (currentActionPage > totalPages) currentActionPage = totalPages;
  if (currentActionPage < 1) currentActionPage = 1;

  const startIndex = (currentActionPage - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, totalEntries);
  const pageItems = filteredActions.slice(startIndex, endIndex);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Không có dữ liệu phù hợp</td></tr>`;
  } else {
    pageItems.forEach(row => {
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
    });
  }

  const infoEl = document.getElementById('actionPageInfo');
  const pageEl = document.getElementById('actionPageCurrent');
  const btnPrev = document.getElementById('actionBtnPrev');
  const btnNext = document.getElementById('actionBtnNext');

  if (infoEl) infoEl.innerText = totalEntries > 0 ? `Showing ${startIndex + 1}-${endIndex} of ${totalEntries} entries` : 'Showing 0 of 0 entries';
  if (pageEl) pageEl.innerText = currentActionPage;
  if (btnPrev) btnPrev.disabled = (currentActionPage <= 1);
  if (btnNext) btnNext.disabled = (currentActionPage >= totalPages || totalEntries === 0);
}

// Thay đổi chỉ số trang (+1 hoặc -1) của bảng Action
function changeActionPage(step) {
  currentActionPage += step;
  renderActionPagination();
}

// 5. Lắng nghe sự kiện Socket.io Realtime
// Nhận dữ liệu telemetry định kỳ từ server
socket.on('sensor_telemetry', (data) => {
  document.getElementById('dash-temp').innerHTML = `${data.temperature} <span>°C</span>`;
  document.getElementById('dash-hum').innerHTML = `${data.humidity} <span>%</span>`;
  document.getElementById('dash-light').innerHTML = `${data.light} <span>Lux</span>`;

  const lightCard = document.getElementById('card-light');
  const lightAlertSub = document.getElementById('dash-light-sub');
  if (data.light < 50) {
    if (lightCard) lightCard.classList.add('card-warning');
    if (lightAlertSub) {
      lightAlertSub.innerText = '⚠️ Cảnh báo: Quá tối (< 50 Lux)';
      lightAlertSub.style.color = 'var(--accent-red)';
    }
  } else {
    if (lightCard) lightCard.classList.remove('card-warning');
    if (lightAlertSub) {
      lightAlertSub.innerText = '↗ Normal Range · Connected';
      lightAlertSub.style.color = 'var(--accent-green)';
    }
  }

  // Thuật toán trượt 8 điểm cho biểu đồ Realtime
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

  // Đẩy 3 bản ghi cảm biến mới vào đầu bảng
  sensorRows.unshift(
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Temperature', value: `${data.temperature} °C`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Humidity', value: `${data.humidity} %`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Ambient Light', value: `${data.light} Lux`, time: data.time }
  );
  filterSensorTable(false);
});

// Nhận phản hồi trạng thái thực tế từ phần cứng hoặc rollback khi timeout
socket.on('device_state_sync', (data) => {
  const toggle = document.getElementById(`toggle-${data.deviceId}`);
  const statusText = document.getElementById(`status-text-${data.deviceId}`);
  const isOn = Number(data.status) === 1;

  if (toggle) {
    toggle.disabled = false;
    toggle.checked = isOn;
  }
  if (statusText) {
    statusText.innerText = `Status: ${isOn ? 'ON' : 'OFF'}`;
  }

  if (data.reason === 'TIMEOUT_FAILED') {
    showToast(`⚠️ Thiết bị ${data.deviceId} không phản hồi! Đã tự động nhả về vị trí cũ.`, 'error');
  }
});

// Đưa bản ghi thao tác vừa thực hiện vào đầu bảng Action History
socket.on('action_logged', (data) => {
  actionRows.unshift({
    id: `#ACT-${data.action_id}`,
    action_id: data.action_id,
    device: data.device_name,
    action: data.action,
    status: data.status,
    time: data.executed_at
  });
  filterActionTable(false);
});

// Nhận cảnh báo ngưỡng từ server
socket.on('alert_trigger', (alert) => {
  showToast(`☀️ ${alert.message}`, 'warning');
});

// 6. Khởi chạy hệ thống & Nạp dữ liệu ban đầu
// Tải dữ liệu ban đầu qua REST API và đồng bộ switch
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

    resDevs.forEach(dev => {
      const toggle = document.getElementById(`toggle-${dev.device_id}`);
      const statusText = document.getElementById(`status-text-${dev.device_id}`);
      const isOn = Number(dev.status) === 1;

      if (toggle) toggle.checked = isOn;
      if (statusText) statusText.innerText = `Status: ${isOn ? 'ON' : 'OFF'}`;
    });

    filterSensorTable();
    filterActionTable();
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

const savedTab = localStorage.getItem('active_iot_tab') || 'dashboard';
switchTab(savedTab);

loadInitialData();