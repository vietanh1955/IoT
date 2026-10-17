let actionPageSize = 20;
let currentActionPage = 1;
let actionRows = [];
let filteredActions = [];
let totalActionEntries = 0;

function onActionPageSizeChange(val) {
  const customInput = document.getElementById('actionCustomLimit');
  if (val === 'custom') {
    if (customInput) {
      customInput.style.display = 'inline-block';
      customInput.value = actionPageSize;
      customInput.focus();
    }
  } else {
    if (customInput) customInput.style.display = 'none';
    actionPageSize = parseInt(val, 10);
    filterActionTable(true);
  }
}

function onActionCustomLimitChange(val) {
  let num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    num = 20;
    showToast('Số dòng không hợp lệ', 'warning');
  } else if (num > 50) {
    num = 50;
    showToast('Tối đa là 50 dòng/trang.', 'info');
  }
  actionPageSize = num;
  filterActionTable(true);
}

async function filterActionTable(resetPage = true) {
  if (resetPage) currentActionPage = 1;

  const searchInput = document.getElementById('actionSearch');
  const devFilter = document.getElementById('actionDeviceFilter');
  const actFilter = document.getElementById('actionTypeFilter');
  const statusFilter = document.getElementById('actionStatusFilter');

  const keyword = searchInput ? searchInput.value.trim() : '';
  const dev = devFilter ? devFilter.value : 'All';
  const act = actFilter ? actFilter.value : 'All';
  const status = statusFilter ? statusFilter.value : 'All';

  let url = `/api/actions?page=${currentActionPage}&limit=${actionPageSize}&device=${encodeURIComponent(dev)}&action=${encodeURIComponent(act)}&status=${encodeURIComponent(status)}`;
  if (keyword) {
    url += `&keyword=${encodeURIComponent(keyword)}`;
  }

  try {
    const res = await fetch(url);
    const result = await res.json();

    totalActionEntries = result.total;
    filteredActions = result.data.map(a => ({
      id: `#ACT-${a.action_id}`,
      action_id: a.action_id,
      device: a.device_name,
      action: a.action,
      status: a.status,
      time: a.executed_at || ''
    }));

    renderActionPagination();
  } catch (err) {
    console.error('Fetch actions error:', err);
  }
}

function renderActionPagination() {
  const tbody = document.getElementById('actionTableBody');
  tbody.innerHTML = '';

  const totalEntries = totalActionEntries;
  const totalPages = Math.ceil(totalEntries / actionPageSize) || 1;

  if (currentActionPage > totalPages) currentActionPage = totalPages;
  if (currentActionPage < 1) currentActionPage = 1;

  const pageItems = filteredActions.length > actionPageSize 
    ? filteredActions.slice(0, actionPageSize) 
    : filteredActions;

  const currentCount = pageItems.length;
  const startIndex = totalEntries > 0 ? (currentActionPage - 1) * actionPageSize + 1 : 0;
  const endIndex = totalEntries > 0 ? (startIndex + currentCount - 1) : 0;

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

  if (infoEl) infoEl.innerText = totalEntries > 0 ? `Showing ${startIndex}-${endIndex} of ${totalEntries} entries` : 'Showing 0 of 0 entries';
  if (pageEl) pageEl.innerText = currentActionPage;
  if (btnPrev) btnPrev.disabled = (currentActionPage <= 1);
  if (btnNext) btnNext.disabled = (currentActionPage >= totalPages || totalEntries === 0);
}

function changeActionPage(step) {
  const totalPages = Math.ceil(totalActionEntries / actionPageSize) || 1;
  const targetPage = currentActionPage + step;
  if (targetPage >= 1 && targetPage <= totalPages) {
    currentActionPage = targetPage;
    filterActionTable(false);
  }
}