const socket = io();

const ROWS_PER_PAGE = 20;
let currentSensorPage = 1;
let currentActionPage = 1;
let sensorRows = [];
let actionRows = [];
let filteredSensors = [];
let filteredActions = [];

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  const targetBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  localStorage.setItem('active_iot_tab', tabId);
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerText = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

const realtimeChartData = {
  labels: [],
  temp: [],
  hum: [],
  light: []
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

function initMockChartData() {
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3000);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    
    realtimeChartData.labels.push(`${hh}:${mm}:${ss}`);
    realtimeChartData.temp.push(Number((28 + Math.random() * 4).toFixed(1)));
    realtimeChartData.hum.push(Number((65 + Math.random() * 15).toFixed(1)));
    realtimeChartData.light.push(Math.floor(250 + Math.random() * 350));
  }

  mainChart.data.labels = [...realtimeChartData.labels];
  mainChart.data.datasets[0].data = [...realtimeChartData.temp];
  mainChart.data.datasets[1].data = [...realtimeChartData.hum];
  mainChart.data.datasets[2].data = [...realtimeChartData.light];
  mainChart.update();

  const lastTemp = realtimeChartData.temp[realtimeChartData.temp.length - 1];
  const lastHum = realtimeChartData.hum[realtimeChartData.hum.length - 1];
  const lastLight = realtimeChartData.light[realtimeChartData.light.length - 1];

  const dashTemp = document.getElementById('dash-temp');
  const dashHum = document.getElementById('dash-hum');
  const dashLight = document.getElementById('dash-light');

  if (dashTemp) dashTemp.innerHTML = `${lastTemp} <span>°C</span>`;
  if (dashHum) dashHum.innerHTML = `${lastHum} <span>%</span>`;
  if (dashLight) dashLight.innerHTML = `${lastLight} <span>Lux</span>`;
}

function handleToggle(deviceId, isChecked) {
  const toggle = document.getElementById(`toggle-${deviceId}`);
  const statusText = document.getElementById(`status-text-${deviceId}`);
  const action = isChecked ? 'ON' : 'OFF';

  if (statusText) statusText.innerText = `Status: ${action} (Loading...)`;
  if (toggle) toggle.disabled = true;

  socket.emit('send_control', { deviceId, action });
}

function filterSensorTable(resetPage = true) {
  if (resetPage) currentSensorPage = 1;

  const searchInput = document.getElementById('sensorSearch');
  const typeFilter = document.getElementById('sensorTypeFilter');

  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const selectedField = typeFilter ? typeFilter.value : '';

  if (!keyword || !selectedField) {
    filteredSensors = [...sensorRows];
    renderSensorPagination();
    return;
  }

  filteredSensors = sensorRows.filter(row => {
    if (selectedField === 'Time') {
      return row.time.toLowerCase().includes(keyword);
    }

    if (row.type === selectedField) {
      const numStr = String(row.value).replace(/[^0-9.]/g, '');
      return numStr.includes(keyword) || row.value.toLowerCase().includes(keyword);
    }

    return false;
  });

  renderSensorPagination();
}

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

function changeSensorPage(step) {
  currentSensorPage += step;
  renderSensorPagination();
}

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

function changeActionPage(step) {
  currentActionPage += step;
  renderActionPagination();
}

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

  mainChart.data.labels = [...realtimeChartData.labels];
  mainChart.data.datasets[0].data = [...realtimeChartData.temp];
  mainChart.data.datasets[1].data = [...realtimeChartData.hum];
  mainChart.data.datasets[2].data = [...realtimeChartData.light];
  mainChart.update();

  sensorRows.unshift(
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Temperature', value: `${data.temperature} °C`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Humidity', value: `${data.humidity} %`, time: data.time },
    { id: `#S${Math.floor(Math.random()*9000)+1000}`, type: 'Ambient Light', value: `${data.light} Lux`, time: data.time }
  );
  filterSensorTable(false);
});

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

socket.on('alert_trigger', (alert) => {
  showToast(`☀️ ${alert.message}`, 'warning');
});

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

initMockChartData();
loadInitialData();