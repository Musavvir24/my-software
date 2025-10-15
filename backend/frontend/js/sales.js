document.addEventListener("DOMContentLoaded", () => {
  loadSalesDailyTotals();
});

async function loadSalesDailyTotals() {
  const userEmail = localStorage.getItem("userEmail");
  if (!userEmail) {
    alert("Login first!");
    return;
  }

  try {
    const res = await fetch(`/api/sales/by-date?userEmail=${encodeURIComponent(userEmail)}`);
    const data = await res.json();

    const tbody = document.querySelector("#salesTable tbody");
    tbody.innerHTML = "";

    let overallTotalAmount = 0;
    let overallTotalProfit = 0;

    // 🔹 For monthly grouping
    let monthlyTotals = {};

    data.forEach(day => {
      const date = new Date(day._id);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // e.g. 2025-09

      let dailyTotalAmount = 0;
      let dailyProfit = 0;

      day.invoices.forEach(inv => {
        const invoiceTotal = inv.totalAmount || 0;
        dailyTotalAmount += invoiceTotal;
        overallTotalAmount += invoiceTotal;

        const invoiceProfit = inv.totalProfit || 0;
        dailyProfit += invoiceProfit;
        overallTotalProfit += invoiceProfit;

        // accumulate into monthly totals
        if (!monthlyTotals[monthKey]) {
          monthlyTotals[monthKey] = { amount: 0, profit: 0 };
        }
        monthlyTotals[monthKey].amount += invoiceTotal;
        monthlyTotals[monthKey].profit += invoiceProfit;

        const products = (inv.items || [])
          .map(i => `${i.productName || i.name || "Unknown"} (x${i.quantity || i.qty || 0})`)
          .join(", ");

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${date.toLocaleDateString("en-IN")}</td>
          <td>${inv.invoiceNumber || inv._id || "-"}</td>
          <td>${inv.customerName || "Walk-in"}</td>
          <td>${products}</td>
          <td>₹${invoiceTotal.toFixed(2)}</td>
          <td>₹${invoiceProfit.toFixed(2)}</td>
          <td>
            <button class="delete-btn" data-id="${inv._id}">🗑 Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // Daily total row
      const totalRow = document.createElement("tr");
      totalRow.classList.add("daily-total-row");
      totalRow.innerHTML = `
        <td colspan="4" style="text-align:right; font-weight:bold;">Total for ${date.toLocaleDateString("en-IN")}:</td>
        <td style="font-weight:bold;">₹${dailyTotalAmount.toFixed(2)}</td>
        <td style="font-weight:bold;">₹${dailyProfit.toFixed(2)}</td>
        <td></td>
      `;
      tbody.appendChild(totalRow);
    });

    // 🔹 Add Monthly Totals Section
    Object.keys(monthlyTotals).forEach(monthKey => {
      const [year, month] = monthKey.split("-");
      const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

      const monthlyRow = document.createElement("tr");
      monthlyRow.classList.add("monthly-total-row");
      monthlyRow.innerHTML = `
        <td colspan="4" style="text-align:right; font-weight:bold; background:#eef;">
          Total for ${monthName}:
        </td>
        <td style="font-weight:bold; background:#eef;">₹${monthlyTotals[monthKey].amount.toFixed(2)}</td>
        <td style="font-weight:bold; background:#eef;">₹${monthlyTotals[monthKey].profit.toFixed(2)}</td>
        <td></td>
      `;
      tbody.appendChild(monthlyRow);
    });

    // ✅ Update footer with overall totals
    document.getElementById("overallTotalAmount").textContent = `₹${overallTotalAmount.toFixed(2)}`;
    document.getElementById("overallTotalProfit").textContent = `₹${overallTotalProfit.toFixed(2)}`;

    // ✅ Add delete event listeners
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (confirm("Are you sure you want to delete this invoice?")) {
          const res = await fetch(`/api/invoices/${id}?userEmail=${encodeURIComponent(userEmail)}`, {
            method: "DELETE"
          });
          if (res.ok) {
            alert("Invoice deleted!");
            loadSalesDailyTotals();      // reload sales table
            if (typeof loadDashboardSummary === "function") loadDashboardSummary();
            if (typeof loadSalesChart === "function") loadSalesChart();
          } else {
            alert("Failed to delete invoice");
          }
        }
      });
    });

  } catch (err) {
    console.error("Error loading daily sales totals:", err);
  }
}
