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

  // Initializes the entire page.
  const init = async () => {
    try {
      const user = await api.fetchUserData();
      ui.renderProfileButton(elements.profileButtonContainer, user);

      renderTimeFilter();
      setupEventListeners();

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
