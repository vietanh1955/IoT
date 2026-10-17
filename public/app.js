const socket = io();

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

socket.on('sensor_telemetry', (data) => {
  document.getElementById('dash-temp').innerHTML = `${data.temperature} <span>°C</span>`;
  document.getElementById('dash-hum').innerHTML = `${data.humidity} <span>%</span>`;
  document.getElementById('dash-light').innerHTML = `${data.light} <span>Lux</span>`;

  const lightCard = document.getElementById('card-light');
  const lightAlertSub = document.getElementById('dash-light-sub');
  if (data.light < 50) {
    if (lightCard) lightCard.classList.add('card-warning');
    if (lightAlertSub) {
      lightAlertSub.innerText = 'Cảnh báo: Quá tối (< 50 Lux)';
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
  const switchLabel = toggle ? toggle.closest('.switch') : null;
  const isOn = Number(data.status) === 1;

  if (switchLabel) switchLabel.classList.remove('loading');

  if (toggle) {
    toggle.disabled = false;
    toggle.checked = isOn;
  }
  if (statusText) {
    statusText.innerText = `Status: ${isOn ? 'ON' : 'OFF'}`;
  }

  if (data.reason === 'TIMEOUT_FAILED') {
    showToast(`Thiết bị ${data.deviceId} không phản hồi! Đã tự động nhả về vị trí cũ.`, 'error');
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
  showToast(`${alert.message}`, 'warning');
});

async function loadInitialData() {
  try {
    await Promise.all([
      filterSensorTable(),
      filterActionTable()
    ]);

    const resDevs = await fetch('/api/devices').then(r => r.json());
    if (Array.isArray(resDevs)) {
      resDevs.forEach(dev => {
        const toggle = document.getElementById(`toggle-${dev.device_id}`);
        const statusText = document.getElementById(`status-text-${dev.device_id}`);
        const isOn = Number(dev.status) === 1;

        if (toggle) toggle.checked = isOn;
        if (statusText) statusText.innerText = `Status: ${isOn ? 'ON' : 'OFF'}`;
      });
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

const savedTab = localStorage.getItem('active_iot_tab') || 'dashboard';
switchTab(savedTab);

initMockChartData();
loadInitialData();