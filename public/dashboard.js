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
  const switchLabel = toggle ? toggle.closest('.switch') : null;
  const action = isChecked ? 'ON' : 'OFF';

  if (statusText) {
    statusText.innerText = `Status: ${action} (Loading...)`;
  }

  if (toggle) toggle.disabled = true;
  if (switchLabel) switchLabel.classList.add('loading');

  socket.emit('send_control', { deviceId, action });
}