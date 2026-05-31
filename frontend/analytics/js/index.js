// This is the main controller script for the analytics page.
// It manages the application state and connects UI events to API calls.
import * as api from "./api.js";
import * as ui from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  // State Management
  const state = {
    timeFrame: "all",
  };

  // Element Selectors
  const elements = {
    themeMenuButton: document.getElementById("theme-menu-button"),
    themeMenu: document.getElementById("theme-menu"),
    profileButtonContainer: document.getElementById("profile-button-container"),
    timeFrameFilterContainer: document.getElementById(
      "time-frame-filter-container",
    ),
    summaryCards: document.getElementById("summary-cards"),
    categoryChartContainer: document.getElementById("category-chart-container"),
    monthlySummaryChartContainer: document.getElementById(
      "monthly-summary-chart-container",
    ),
    categoryTrendSelect: document.getElementById("category-trend-select"),
    categoryTrendChartContainer: document.getElementById(
      "category-trend-chart-container",
    ),
    offlineDot: document.getElementById("offline-dot"),
  };

  // Helper to render categories and load trend chart
  const renderCategoriesAndTrend = async (categories) => {
    elements.categoryTrendSelect.innerHTML = "";
    categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      elements.categoryTrendSelect.appendChild(option);
    });
    if (categories.length > 0) {
      // For trend chart, also use SWR
      const firstCat = categories[0];
      const cacheKey = `analytics_trend_${firstCat}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        ui.renderCategoryTrendChart(elements.categoryTrendChartContainer, JSON.parse(cached), firstCat);
      }
      const trendData = await api.fetchCategoryTrend(firstCat);
      localStorage.setItem(cacheKey, JSON.stringify(trendData));
      ui.renderCategoryTrendChart(elements.categoryTrendChartContainer, trendData, firstCat);
    } else {
      elements.categoryTrendChartContainer.innerHTML =
        '<p class="text-center text-gray-500 dark:text-gray-400 pt-16">No categories to analyze.</p>';
    }
  };

  // Data Fetching and Rendering with Stale-While-Revalidate (SWR)
  const updateDynamicContent = async () => {
    try {
      const cacheKeySummary = `analytics_summary_${state.timeFrame}`;
      const cacheKeyCategory = `analytics_category_${state.timeFrame}`;

      // 1. Paint cached data immediately (0ms)
      const cachedSummary = localStorage.getItem(cacheKeySummary);
      const cachedCategory = localStorage.getItem(cacheKeyCategory);
      if (cachedSummary) ui.renderSummaryCards(elements.summaryCards, JSON.parse(cachedSummary));
      if (cachedCategory) ui.renderCategoryChart(elements.categoryChartContainer, JSON.parse(cachedCategory));

      // 2. Fetch fresh data in parallel
      const [summary, categoryData] = await Promise.all([
        api.fetchSummary(state.timeFrame),
        api.fetchExpensesByCategory(state.timeFrame)
      ]);

      // 3. Store fresh data in cache
      localStorage.setItem(cacheKeySummary, JSON.stringify(summary));
      localStorage.setItem(cacheKeyCategory, JSON.stringify(categoryData));

      // 4. Update UI silently
      ui.renderSummaryCards(elements.summaryCards, summary);
      ui.renderCategoryChart(elements.categoryChartContainer, categoryData);
    } catch (error) {
      console.error("Failed to update dynamic content:", error);
    }
  };

  const loadStaticContent = async () => {
    try {
      const cacheKeyMonthly = `analytics_monthly`;
      const cacheKeyCategories = `analytics_categories`;

      // Paint cached data immediately
      const cachedMonthly = localStorage.getItem(cacheKeyMonthly);
      const cachedCategories = localStorage.getItem(cacheKeyCategories);
      if (cachedMonthly) ui.renderMonthlySummaryChart(elements.monthlySummaryChartContainer, JSON.parse(cachedMonthly));
      if (cachedCategories) renderCategoriesAndTrend(JSON.parse(cachedCategories));

      // Fetch fresh data in parallel
      const [monthlyData, categories] = await Promise.all([
        api.fetchMonthlySummary(),
        api.fetchCategories()
      ]);

      // Update cache
      localStorage.setItem(cacheKeyMonthly, JSON.stringify(monthlyData));
      localStorage.setItem(cacheKeyCategories, JSON.stringify(categories));

      // Update UI silently
      ui.renderMonthlySummaryChart(elements.monthlySummaryChartContainer, monthlyData);
      
      // Only re-render categories if we didn't have them in cache (prevents trend chart flickering)
      if (!cachedCategories) {
        renderCategoriesAndTrend(categories);
      }
    } catch (error) {
      console.error("Failed to load static content:", error);
    }
  };

  // Event Handlers
  const handleTimeFrameChange = (newTimeFrame) => {
    state.timeFrame = newTimeFrame;
    updateDynamicContent();
  };

  const handleCategoryTrendChange = async (categoryName) => {
    try {
      const cacheKey = `analytics_trend_${categoryName}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        ui.renderCategoryTrendChart(elements.categoryTrendChartContainer, JSON.parse(cached), categoryName);
      }

      const trendData = await api.fetchCategoryTrend(categoryName);
      
      localStorage.setItem(cacheKey, JSON.stringify(trendData));
      ui.renderCategoryTrendChart(
        elements.categoryTrendChartContainer,
        trendData,
        categoryName,
      );
    } catch (error) {
      console.error("Failed to update category trend chart:", error);
    }
  };

  const refreshAllCharts = () => {
    updateDynamicContent(); // re-renders the summary cards and category chart
    loadStaticContent(); // re-renders the monthly and trend charts
  };

  // Setup Functions
  const setupEventListeners = () => {
    if (elements.themeMenuButton) {
      const applyTheme = (theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      };

      //check if darkmode theme is saved in localstorage, or use system preference
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) applyTheme(savedTheme);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
        applyTheme("dark");

      elements.themeMenuButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const profileMenu = document.getElementById("profile-menu");
        if (profileMenu) profileMenu.classList.add("hidden");
        elements.themeMenu.classList.toggle("hidden");
      });

      //event listeners for darkmode buttons
      elements.themeMenu.querySelectorAll("[data-theme]").forEach((option) => {
        option.addEventListener("click", (e) => {
          e.preventDefault();
          const selectedTheme = e.target.getAttribute("data-theme");
          if (selectedTheme === "system") {
            localStorage.removeItem("theme");
            applyTheme(
              window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light",
            );
          } else {
            localStorage.setItem("theme", selectedTheme);
            applyTheme(selectedTheme);
          }
          elements.themeMenu.classList.add("hidden");

          // Re-render charts after the theme has been applied.
          refreshAllCharts();
        });
      });
    }
    //hide menu if clicked anywhere outside
    window.addEventListener("click", () => {
      const profileMenu = document.getElementById("profile-menu");
      if (
        elements.themeMenu &&
        !elements.themeMenu.classList.contains("hidden")
      ) {
        elements.themeMenu.classList.add("hidden");
      }
      if (profileMenu && !profileMenu.classList.contains("hidden")) {
        profileMenu.classList.add("hidden");
      }
      document.querySelectorAll(".relative .origin-top-left").forEach((m) => {
        m.classList.add("hidden");
      });
    });
    elements.categoryTrendSelect.addEventListener("change", (e) =>
      handleCategoryTrendChange(e.target.value),
    );

  };

  const renderTimeFilter = () => {
    const options = [
      { value: "all", label: "All Time" },
      { value: "week", label: "Past Week" },
      { value: "month", label: "Past Month" },
      { value: "3months", label: "Past 3 Months" },
    ];
    const dropdown = ui.createDropdown(
      "timeFrame",
      options,
      "All Time",
      handleTimeFrameChange,
    );
    elements.timeFrameFilterContainer.appendChild(dropdown);
  };

  // ---------------------------------------------------------------------------
  // PWA Offline / Online Network Listeners
  // ---------------------------------------------------------------------------
  const renderOnlineAiCoach = () => {
    const section = document.getElementById("ai-coach-section");
    if (!section) return;
    section.innerHTML = `
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 p-6 rounded-xl shadow-sm border border-blue-100 dark:border-slate-700 relative overflow-hidden animate-fade-in-up">
        <div class="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              AI Financial Coach
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Get personalized, actionable advice based on your recent spending habits.</p>
          </div>
          <button id="btn-analyze-spending" class="shrink-0 inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
            Analyze My Spending
          </button>
        </div>
        <div id="ai-insights-container" class="mt-4 hidden">
          <div id="ai-insights-loading" class="hidden flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span class="text-sm font-medium">Analyzing your spending patterns...</span>
          </div>
          <div id="ai-insights-error" class="hidden text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-800"></div>
          <ul id="ai-insights-list" class="hidden space-y-3 mt-4 text-gray-700 dark:text-gray-300"></ul>
        </div>
      </div>
    `;

    // AI Coach Button Logic
    const btnAnalyze = document.getElementById("btn-analyze-spending");
    if (btnAnalyze) {
      btnAnalyze.addEventListener("click", async () => {
        // Prevent click if offline
        if (!navigator.onLine) {
          alert("AI Coach is not available while offline.");
          return;
        }

        const container = document.getElementById("ai-insights-container");
        const loading = document.getElementById("ai-insights-loading");
        const errorEl = document.getElementById("ai-insights-error");
        const list = document.getElementById("ai-insights-list");

        // UI Reset
        container.classList.remove("hidden");
        loading.classList.remove("hidden");
        errorEl.classList.add("hidden");
        list.classList.add("hidden");
        btnAnalyze.disabled = true;

        try {
          const cacheKeySummary = `analytics_summary_${state.timeFrame}`;
          const cacheKeyCategory = `analytics_category_${state.timeFrame}`;
          const summary = JSON.parse(localStorage.getItem(cacheKeySummary) || "{}");
          const category = JSON.parse(localStorage.getItem(cacheKeyCategory) || "[]");
          
          const payload = {
            timeFrame: state.timeFrame,
            summary,
            expensesByCategory: category
          };

          const result = await api.fetchAiInsights(payload);
          loading.classList.add("hidden");
          ui.renderAiInsights(result.advice);
        } catch (error) {
          loading.classList.add("hidden");
          errorEl.textContent = error.message;
          errorEl.classList.remove("hidden");
        } finally {
          btnAnalyze.disabled = false;
        }
      });
    }
  };

  const renderOfflineAiCoach = () => {
    const section = document.getElementById("ai-coach-section");
    if (!section) return;
    section.innerHTML = `
      <div class="animate-slide-down flex items-center gap-4 bg-amber-50 dark:bg-amber-900/20
                  border border-amber-200 dark:border-amber-700/50 rounded-lg px-5 py-4">
        <div class="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40
                    flex items-center justify-center">
          <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072
                 M12 11a1 1 0 100 2 1 1 0 000-2z"
            />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18"/>
          </svg>
        </div>
        <div>
          <p class="font-semibold text-amber-800 dark:text-amber-300 text-sm">AI Coach unavailable offline</p>
          <p class="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
            The Financial Coach requires an internet connection to analyze your data.
          </p>
        </div>
      </div>
    `;
  };

  const setupPwaNetworkListeners = () => {
    const applyNetworkState = (isOnline) => {
      if (elements.offlineDot) {
        elements.offlineDot.classList.toggle("hidden", isOnline);
        elements.offlineDot.classList.toggle("flex", !isOnline);
      }
      if (isOnline) {
        renderOnlineAiCoach();
      } else {
        renderOfflineAiCoach();
      }
    };

    window.addEventListener("online", () => applyNetworkState(true));
    window.addEventListener("offline", () => applyNetworkState(false));

    // Apply immediately on page load
    applyNetworkState(navigator.onLine);
  };

  // Initializes the entire page.
  const init = async () => {
    try {
      const user = await api.fetchUserData();
      ui.renderProfileButton(elements.profileButtonContainer, user);

      renderTimeFilter();
      setupEventListeners();
      setupPwaNetworkListeners();

      // Load all content
      updateDynamicContent(); // For time-sensitive data
      loadStaticContent();
    } catch (error) {
      console.error("Initialization failed:", error);
      window.location.href = "/"; // Redirect to login page on auth failure
    }
  };
  init();
});
