// This module contains all DOM manipulation functions for the analytics page.

// ---------------------------------------------------------------------------
// XSS Prevention: HTML entity escaper
// Any user-supplied string (category name, display name, etc.) MUST pass
// through this before being injected into innerHTML.
// ---------------------------------------------------------------------------
const sanitize = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

// Helper Functions
const isDarkMode = () => document.documentElement.classList.contains("dark");
const getChartColors = () => ({
  textColor: isDarkMode() ? "#CBD5E1" : "#475569",
  gridColor: isDarkMode() ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
  borderColor: isDarkMode() ? "#1E293B" : "#FFFFFF",
});
const formatCurrency = (amount) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

//Chart Instances
let categoryChart, monthlySummaryChart, categoryTrendChart;

// Renders the summary cards with income, expense, and savings data. Takes the div/container where to render data.
export const renderSummaryCards = (container, summary) => {
  container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Income</h3>
          <p class="text-3xl font-bold text-green-500 mt-1">${formatCurrency(summary.totalIncome)}</p>
        </div>
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Expenses</h3>
          <p class="text-3xl font-bold text-red-500 mt-1">${formatCurrency(summary.totalExpense)}</p>
        </div>
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Net Savings</h3>
          <p class="text-3xl font-bold ${summary.netSavings >= 0 ? "text-blue-500" : "text-yellow-500"} mt-1">${formatCurrency(summary.netSavings)}</p>
        </div>
    `;
};

// Renders the "Expenses by Category" doughnut chart.
export const renderCategoryChart = (container, data) => {
  container.innerHTML = '<canvas id="category-chart"></canvas>';
  if (data.length === 0) {
    container.innerHTML =
      '<p class="text-center text-gray-500 dark:text-gray-400 pt-16">No expense data to display for this period.</p>';
    return;
  }
  const labels = data.map((item) => item.category);
  const amounts = data.map((item) => item.totalAmount);
  const colors = getChartColors();
  const ctx = document.getElementById("category-chart").getContext("2d");
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: amounts,
          backgroundColor: [
            "#3B82F6",
            "#10B981",
            "#F59E0B",
            "#EF4444",
            "#8B5CF6",
            "#EC4899",
          ],
          borderColor: colors.borderColor,
          borderWidth: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: colors.textColor } },
      },
    },
  });
};

// Renders the "Monthly Summary" bar chart.
export const renderMonthlySummaryChart = (container, data) => {
  container.innerHTML = '<canvas id="monthly-summary-chart"></canvas>';
  if (data.length === 0) {
    container.innerHTML =
      '<p class="text-center text-gray-500 dark:text-gray-400 pt-16">No data for monthly summary.</p>';
    return;
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthlyMap = {};
  data.forEach((item) => {
    const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, "0")}`;
    if (!monthlyMap[monthKey])
      monthlyMap[monthKey] = {
        income: 0,
        expense: 0,
        label: `${monthNames[item._id.month - 1]} ${item._id.year}`,
      };
    monthlyMap[monthKey][item._id.type] = item.totalAmount;
  });
  const sortedKeys = Object.keys(monthlyMap).sort();
  const labels = sortedKeys.map((key) => monthlyMap[key].label);
  const incomeData = sortedKeys.map((key) => monthlyMap[key].income);
  const expenseData = sortedKeys.map((key) => monthlyMap[key].expense);
  const colors = getChartColors();
  const ctx = document.getElementById("monthly-summary-chart").getContext("2d");
  if (monthlySummaryChart) monthlySummaryChart.destroy();
  monthlySummaryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Income",
          data: incomeData,
          backgroundColor: "rgba(16, 185, 129, 0.6)",
        },
        {
          label: "Expense",
          data: expenseData,
          backgroundColor: "rgba(239, 68, 68, 0.6)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: colors.textColor },
          grid: { color: colors.gridColor },
        },
        x: {
          ticks: { color: colors.textColor },
          grid: { color: colors.gridColor },
        },
      },
      plugins: { legend: { labels: { color: colors.textColor } } },
    },
  });
};

// Renders the "Spending Trend" line chart.
export const renderCategoryTrendChart = (container, data, categoryName) => {
  container.innerHTML = '<canvas id="category-trend-chart"></canvas>';
  if (data.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 pt-16">No spending data for ${sanitize(categoryName)}.</p>`;
    return;
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const labels = data.map(
    (item) => `${monthNames[item._id.month - 1]} ${item._id.year}`,
  );
  const amounts = data.map((item) => item.totalAmount);
  const colors = getChartColors();
  const ctx = document.getElementById("category-trend-chart").getContext("2d");
  if (categoryTrendChart) categoryTrendChart.destroy();
  categoryTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: `Spending in ${sanitize(categoryName)}`,
          data: amounts,
          borderColor: "#3B82F6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: colors.textColor },
          grid: { color: colors.gridColor },
        },
        x: {
          ticks: { color: colors.textColor },
          grid: { color: colors.gridColor },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
};

// Creates a custom dropdown button, used for the time filter.
export const createDropdown = (name, options, defaultLabel, onSelect) => {
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "relative inline-block text-left";
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "inline-flex items-center justify-center w-full rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm px-4 py-2 bg-gray-50 dark:bg-slate-700/50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-600 hover:shadow focus:outline-none transition-all duration-200";
  button.innerHTML = `<span id="${name}-label">${defaultLabel}</span><svg class="-mr-1 ml-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
  const menu = document.createElement("div");
  menu.className =
    "origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none hidden z-10";
  options.forEach((option) => {
    const a = document.createElement("a");
    a.href = "#";
    a.className =
      "text-gray-700 dark:text-gray-300 block px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700";
    a.dataset.value = option.value;
    a.textContent = option.label;
    a.onclick = (e) => {
      e.preventDefault();
      document.getElementById(`${name}-label`).textContent = option.label;
      menu.classList.add("hidden");
      onSelect(option.value);
    };
    menu.appendChild(a);
  });
  dropdownContainer.append(button, menu);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    document
      .querySelectorAll(
        ".relative .origin-top-left, #profile-menu, #theme-menu",
      )
      .forEach((m) => m !== menu && m.classList.add("hidden"));
    menu.classList.toggle("hidden");
  });
  return dropdownContainer;
};

// Renders the user's profile button in the header.
export const renderProfileButton = (container, user) => {
  // user.image comes from the Mongoose User model (set during Google OAuth)
  // user.photos is a Passport profile property not stored in our DB
  const userPicture =
    user.image ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random&color=fff`;
    container.innerHTML = `
        <div class="relative">
            <button id="profile-menu-button" type="button" class="flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-slate-800 focus:ring-blue-500">
                <img class="h-8 w-8 rounded-full object-cover" src="${userPicture}" alt="User profile">
            </button>
            <div id="profile-menu" class="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black dark:ring-white ring-opacity-5 py-1 z-20">
                <a href="/dashboard" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">Dashboard</a>
                <a href="/auth/logout" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">Logout</a>
                <div class="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                <a href="#" id="delete-account-btn" class="block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium">Delete Account</a>
            </div>
        </div>
    `;
  const profileMenuButton = document.getElementById("profile-menu-button");
  const profileMenu = document.getElementById("profile-menu");
  if (profileMenuButton && profileMenu) {
    profileMenuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.getElementById("theme-menu"))
        document.getElementById("theme-menu").classList.add("hidden");
      profileMenu.classList.toggle("hidden");
    });
  }

  const deleteBtn = document.getElementById("delete-account-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const confirmed = prompt("WARNING: This will permanently delete your account and all your transactions.\n\nType 'DELETE' to confirm:");
      if (confirmed === 'DELETE') {
        try {
          const res = await fetch("/auth/account", { method: "DELETE" });
          if (res.ok) {
            window.location.href = "/";
          } else {
            alert("Failed to delete account. Please try again.");
          }
        } catch (err) {
          console.error(err);
          alert("Error connecting to server to delete account.");
        }
      }
    });
  }
};

// Renders the AI Financial Coach insights
export const renderAiInsights = (adviceList) => {
  const container = document.getElementById("ai-insights-container");
  const list = document.getElementById("ai-insights-list");
  
  if (!adviceList || adviceList.length === 0) return;
  
  container.classList.remove("hidden");
  list.classList.remove("hidden");
  
  list.innerHTML = adviceList.map(point => `
    <li class="flex items-start gap-3 bg-white/50 dark:bg-slate-900/50 p-3 rounded-lg border border-white/20 dark:border-slate-700/50">
      <span class="text-blue-500 mt-0.5">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
      </span>
      <span class="text-sm flex-1 leading-relaxed">${sanitize(point)}</span>
    </li>
  `).join("");
};
