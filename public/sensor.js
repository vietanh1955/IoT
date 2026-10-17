let sensorPageSize = 20;
let currentSensorPage = 1;
let sensorRows = [];
let filteredSensors = [];
let totalSensorEntries = 0;

function onSensorTypeChange() {
  const typeFilter = document.getElementById('sensorTypeFilter');
  const searchInput = document.getElementById('sensorSearch');
  
  if (typeFilter && searchInput) {
    const val = typeFilter.value;
    if (val === 'All') {
      searchInput.placeholder = 'Search';
    } else if (val === 'Time') {
      searchInput.placeholder = 'Search by time (YYYY-MM-DD hh:mm:ss)...';
    } else {
      searchInput.placeholder = `Search by ${val} values...`;
    }
  }

  filterSensorTable(true);
}

async function filterSensorTable(resetPage = true) {
  if (resetPage) currentSensorPage = 1;

  const searchInput = document.getElementById('sensorSearch');
  const typeFilter = document.getElementById('sensorTypeFilter');

  const keyword = searchInput ? searchInput.value.trim() : '';
  const selectedField = typeFilter ? typeFilter.value : '';

  let url = `/api/sensors?page=${currentSensorPage}&limit=${sensorPageSize}`;
  if (keyword) {
    url += `&field=${encodeURIComponent(selectedField || 'All')}&keyword=${encodeURIComponent(keyword)}`;
  }

  try {
    const res = await fetch(url);
    const result = await res.json();

    totalSensorEntries = result.total;
    filteredSensors = result.data.map(s => ({
      id: `#S${s.data_id}`,
      type: s.sensor_type,
      value: `${s.reading_value} ${s.unit || ''}`,
      time: s.recorded_at || ''
    }));
    
    renderSensorPagination();
  } catch (err) {
    console.error('Fetch sensors error:', err);
  }
}

function onSensorPageSizeChange(val) {
  const customInput = document.getElementById('sensorCustomLimit');
  if (val === 'custom') {
    if (customInput) {
      customInput.style.display = 'inline-block';
      customInput.value = sensorPageSize;
      customInput.focus();
    }
  } else {
    if (customInput) customInput.style.display = 'none';
    sensorPageSize = parseInt(val, 10);
    filterSensorTable(true);
  }
}

function onSensorCustomLimitChange(val) {
  let num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    num = 20;
    showToast('Số dòng không hợp lệ', 'warning');
  } else if (num > 50) {
    num = 50;
    showToast('Tối đa là 50 dòng/trang.', 'info');
  }
  sensorPageSize = num;
  filterSensorTable(true);
}

function renderSensorPagination() {
  const tbody = document.getElementById('sensorTableBody');
  tbody.innerHTML = '';

  const totalEntries = totalSensorEntries;
  const totalPages = Math.ceil(totalEntries / sensorPageSize) || 1;

  if (currentSensorPage > totalPages) currentSensorPage = totalPages;
  if (currentSensorPage < 1) currentSensorPage = 1;

  const startIndex = (currentSensorPage - 1) * sensorPageSize;
  const endIndex = Math.min(startIndex + sensorPageSize, totalEntries);
  const pageItems = filteredSensors;

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
  const totalPages = Math.ceil(totalSensorEntries / sensorPageSize) || 1;
  const targetPage = currentSensorPage + step;
  if (targetPage >= 1 && targetPage <= totalPages) {
    currentSensorPage = targetPage;
    filterSensorTable(false);
  }
}