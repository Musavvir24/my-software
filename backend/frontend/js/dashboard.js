const API_BASE = 'http://localhost:3000';
const userEmail = localStorage.getItem('userEmail') || 'webnetic78@example.com';

// Safe DOM text setter
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.textContent = text;
  return true;
}

// Escape HTML
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;')
                  .replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;');
}

// Format numbers
function formatCurrencyNumber(n) {
  const num = Number(n || 0);
  return isFinite(num) ? `₹ ${num.toFixed(2)}` : '₹ 0.00';
}
function formatInteger(n) {
  const num = Number(n || 0);
  return isFinite(num) ? String(Math.round(num)) : '0';
}

// Render Top Selling
function renderTopSelling(products) {
  const table = document.getElementById("top-selling-table");
  if (!table) return;
  table.innerHTML = products.length
    ? products.map(p => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${formatInteger(p.sold)}</td>
          <td>${formatInteger(p.quantity)}</td>
          <td>${formatCurrencyNumber(p.price)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4">No sales yet</td></tr>`;
}

// Render Low Stock
function renderLowStock(products) {
  const list = document.getElementById("low-stock-list");
  if (!list) return;
  list.innerHTML = products.length
    ? products.map(p => `<li>${escapeHtml(p.name)} — Qty: ${formatInteger(p.quantity)}</li>`).join("")
    : "<li>✅ All stocks are fine</li>";
}

// Load dashboard summary data
async function loadDashboardData() {
  if (!userEmail) return;
  try {
    const res = await fetch(`${API_BASE}/api/dashboard?userEmail=${encodeURIComponent(userEmail)}`);
    if (!res.ok) {
      console.error('Failed to fetch dashboard data');
      return;
    }

    const data = await res.json();

    // Update summary counters
    safeSetText('salesCount', formatInteger(data.totalSales || 0));
    safeSetText('inventory', formatInteger(data.totalProducts || 0) + ' items');
    safeSetText('revenue', formatCurrencyNumber(data.totalRevenue || 0));
    safeSetText('profit', formatCurrencyNumber(data.totalProfit || 0));

    // Render top selling + low stock
    renderTopSelling(data.topSelling || []);
    renderLowStock(data.lowStockItems || []);
  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

// Daily counters reset
let lastReset = null;
function resetDailyCounters() {
  const today = new Date().toDateString();
  if (lastReset !== today) {
    lastReset = today;
    safeSetText('salesCount', '0');
    safeSetText('inventory', '0 items');
    safeSetText('revenue', '₹0.00');
    safeSetText('profit', '₹0.00');
  }
}

/* ------------------------
   Sales & Bills Chart
------------------------ */
const ctx = document.getElementById('salesPurchasesChart').getContext('2d');
let salesBillsChart;

async function fetchSalesBillsData(rangeDays = 31) {
  if (!userEmail) return { labels: [], salesData: [], billsData: [] };
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/sales-parties?userEmail=${encodeURIComponent(userEmail)}&days=${rangeDays}`);
    if (!res.ok) throw new Error('Failed to fetch sales-bills data');
    const data = await res.json();
    return {
      labels: data.labels || [],
      salesData: data.salesData || [],
      billsData: data.billsData || []
    };
  } catch (err) {
    console.error("Error fetching chart data", err);
    return { labels: [], salesData: [], billsData: [] };
  }
}

async function updateSalesBillsChart(rangeDays = 31) {
  const chartData = await fetchSalesBillsData(rangeDays);

  const data = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'Sales',
        data: chartData.salesData,
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      },
      {
        label: 'Bills',
        data: chartData.billsData,
        backgroundColor: 'rgba(255, 159, 64, 0.7)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false },
    },
    interaction: {
      mode: 'nearest',
      intersect: false
    },
    scales: {
      x: {
        stacked: false,
        ticks: {
          maxRotation: 45,
          minRotation: 45
        },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        grid: { drawBorder: false, color: '#e0e0e0' }
      }
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10
      }
    }
  };

  if (salesBillsChart) {
    salesBillsChart.data = data;
    salesBillsChart.options = options;
    salesBillsChart.update();
  } else {
    salesBillsChart = new Chart(ctx, { type: 'bar', data, options });
  }
}

// Range selector
document.getElementById('chartRange').addEventListener('change', (e) => {
  const days = parseInt(e.target.value);
  updateSalesBillsChart(days);
});

// Initial load
updateSalesBillsChart(31);




// ------------------------
// Initialize dashboard
// ------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadDashboardData();            // summary counters, top-selling, low-stock
  updateSalesBillsChart(31);      // sales & bills chart (default 31 days)
  resetDailyCounters();

  setInterval(resetDailyCounters, 60 * 1000);
  setInterval(loadDashboardData, 5 * 60 * 1000);
});

