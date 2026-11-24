const realtimeChartData = {
  labels: [],
  temp: [],
  hum: [],
  light: [],
  wind: []
};

const ctx = document.getElementById('mainChart').getContext('2d');
const mainChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Temp (°C)',
        data: [],
        borderColor: '#EF4444',
        backgroundColor: '#EF4444',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Humidity (%)',
        data: [],
        borderColor: '#38BDF8',
        backgroundColor: '#38BDF8',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Light (Lux)',
        data: [],
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B',
        tension: 0.3,
        yAxisID: 'yLight'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94A3B8' }
      },
      y: {
        position: 'left',
        suggestedMin: 0,
        suggestedMax: 100,
        grid: { color: '#334155' },
        ticks: { color: '#94A3B8' }
      },
      yLight: {
        position: 'right',
        suggestedMin: 0,
        suggestedMax: 1000,
        grid: { drawOnChartArea: false },
        ticks: { color: '#94A3B8' }
      }
    },
    plugins: {
      legend: { labels: { color: '#F8FAFC' } }
    }
  }
});

const windCanvas = document.getElementById('windChart');
const windChart = windCanvas ? new Chart(windCanvas.getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Wind Speed (m/s)',
        data: [],
        borderColor: '#38BDF8',
        backgroundColor: '#38BDF8',
        tension: 0.3
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94A3B8' }
      },
      y: {
        min: 0,
        max: 20,
        grid: { color: '#334155' },
        ticks: {
          color: '#94A3B8',
          stepSize: 2
        }
      }
    },
    plugins: {
      legend: { labels: { color: '#F8FAFC' } }
    }
  }
}) : null;

(function initWindTelemetry() {
  const s = window.socket || (typeof socket !== 'undefined' ? socket : null);
  if (!s) {
    setTimeout(initWindTelemetry, 200);
    return;
  }

  s.on('sensor_telemetry', (data) => {
    if (data.wind === undefined) return;

    const windEl = document.getElementById('dash-wind');
    if (windEl) windEl.innerHTML = `${data.wind} <span>m/s</span>`;

    if (windChart) {
      const timeLabel = (data.time && data.time.includes(' ')) ? data.time.split(' ')[1] : data.time;
      if (realtimeChartData.wind.length >= 8) {
        realtimeChartData.wind.shift();
      }
      realtimeChartData.wind.push(data.wind);

      const currentLabels = mainChart.data.labels.length ? [...mainChart.data.labels] : [...realtimeChartData.labels];
      if (!mainChart.data.labels.length) {
        if (currentLabels.length >= 8) currentLabels.shift();
        currentLabels.push(timeLabel);
        realtimeChartData.labels = currentLabels;
      }

      windChart.data.labels = currentLabels;
      windChart.data.datasets[0].data = [...realtimeChartData.wind];
      windChart.update();
    }
  });
})();

function initMockChartData() {
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 2000);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    
    realtimeChartData.labels.push(`${hh}:${mm}:${ss}`);
    realtimeChartData.temp.push(Number((28 + Math.random() * 4).toFixed(1)));
    realtimeChartData.hum.push(Number((65 + Math.random() * 15).toFixed(1)));
    realtimeChartData.light.push(Math.floor(250 + Math.random() * 350));
    realtimeChartData.wind.push(Number((6 + Math.random() * 6).toFixed(1)));
  }

  mainChart.data.labels = [...realtimeChartData.labels];
  mainChart.data.datasets[0].data = [...realtimeChartData.temp];
  mainChart.data.datasets[1].data = [...realtimeChartData.hum];
  mainChart.data.datasets[2].data = [...realtimeChartData.light];
  mainChart.update();

  if (windChart) {
    windChart.data.labels = [...realtimeChartData.labels];
    windChart.data.datasets[0].data = [...realtimeChartData.wind];
    windChart.update();
  }

  const lastTemp = realtimeChartData.temp[realtimeChartData.temp.length - 1];
  const lastHum = realtimeChartData.hum[realtimeChartData.hum.length - 1];  
  const lastLight = realtimeChartData.light[realtimeChartData.light.length - 1];
  const lastWind = realtimeChartData.wind[realtimeChartData.wind.length - 1];

  const dashTemp = document.getElementById('dash-temp');
  const dashHum = document.getElementById('dash-hum');
  const dashLight = document.getElementById('dash-light');
  const dashWind = document.getElementById('dash-wind');

  if (dashTemp) dashTemp.innerHTML = `${lastTemp} <span>°C</span>`;
  if (dashHum) dashHum.innerHTML = `${lastHum} <span>%</span>`;
  if (dashLight) dashLight.innerHTML = `${lastLight} <span>Lux</span>`;
  if (dashWind) dashWind.innerHTML = `${lastWind} <span>m/s</span>`;
}

function handleToggle(deviceId, isChecked) {
  const toggle = document.getElementById(`toggle-${deviceId}`);
  const statusText = document.getElementById(`status-text-${deviceId}`);
  const switchLabel = toggle ? toggle.closest('.switch') : null;
  const action = isChecked ? 'ON' : 'OFF';

  if (statusText) {
    statusText.innerText = `Status: ${action} (Loading...)`;
  }

  if (toggle) toggle.disabled = true;
  if (switchLabel) switchLabel.classList.add('loading');

  socket.emit('send_control', { deviceId, action });
}