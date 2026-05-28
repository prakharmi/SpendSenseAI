const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware/authMiddleware");
const {
  validate,
  analyticsDateRangeRules,
  categoryTrendRules,
} = require("../middleware/validationMiddleware");
const Transaction = require("../models/Transaction");
const Category = require("../models/Category");
const mongoose = require("mongoose");
const analyticsCache = require("../utils/cache");

/**
 * Cache TTL for analytics data.
 * 5 minutes balances freshness vs performance.
 * Analytics data changes only when a transaction is added/deleted,
 * at which point we proactively invalidate the cache — so in practice
 * users almost always see up-to-date data even with a 5-min TTL.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Creates a MongoDB date filter object based on a range string.
 * Returns {} for "all" (no date restriction).
 */
const createDateFilter = (dateRange) => {
  if (!dateRange || dateRange === "all") return {};
  const startDate = new Date();
  if (dateRange === "week") startDate.setDate(startDate.getDate() - 7);
  else if (dateRange === "month") startDate.setMonth(startDate.getMonth() - 1);
  else if (dateRange === "3months") startDate.setMonth(startDate.getMonth() - 3);
  return { date: { $gte: startDate } };
};

// ---------------------------------------------------------------------------
// GET /api/analytics/summary
// Returns totalIncome, totalExpense, and netSavings for the given time range.
// Cached per user+dateRange for 5 minutes.
// ---------------------------------------------------------------------------
router.get("/summary", isLoggedIn, analyticsDateRangeRules, validate, async (req, res) => {
  try {
    const { dateRange = "all" } = req.query;
    const cacheKey = `${req.user.id}:summary:${dateRange}`;

    // Cache HIT — return immediately without touching MongoDB
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const dateFilter = createDateFilter(dateRange);
    const summary = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          ...dateFilter,
        },
      },
      { $group: { _id: "$type", totalAmount: { $sum: "$amount" } } },
    ]);

    const result = { totalIncome: 0, totalExpense: 0, netSavings: 0 };
    summary.forEach((item) => {
      if (item._id === "income") result.totalIncome = item.totalAmount;
      else if (item._id === "expense") result.totalExpense = item.totalAmount;
    });
    result.netSavings = result.totalIncome - result.totalExpense;

    // Cache MISS — store result and respond
    analyticsCache.set(cacheKey, result, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/expenses-by-category
// Returns total expenses grouped by category for the given time range.
// Cached per user+dateRange for 5 minutes.
// ---------------------------------------------------------------------------
router.get(
  "/expenses-by-category",
  isLoggedIn,
  analyticsDateRangeRules,
  validate,
  async (req, res) => {
    try {
      const { dateRange = "all" } = req.query;
      const cacheKey = `${req.user.id}:expenses:${dateRange}`;

      const cached = analyticsCache.get(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached);
      }

      const dateFilter = createDateFilter(dateRange);
      const expensesByCategory = await Transaction.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(req.user.id),
            type: "expense",
            ...dateFilter,
          },
        },
        { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        {
          $project: {
            _id: 0,
            category: { $arrayElemAt: ["$categoryDetails.name", 0] },
            totalAmount: 1,
          },
        },
        { $sort: { totalAmount: -1 } },
      ]);

      analyticsCache.set(cacheKey, expensesByCategory, CACHE_TTL_MS);
      res.setHeader("X-Cache", "MISS");
      res.json(expensesByCategory);
    } catch (error) {
      console.error("Error fetching expenses by category:", error);
      res.status(500).json({ message: "Server Error" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/analytics/monthly-summary
// Returns monthly income vs expense for all time (bar chart).
// No dateRange filter — always shows full history.
// Cached per user for 5 minutes.
// ---------------------------------------------------------------------------
router.get("/monthly-summary", isLoggedIn, async (req, res) => {
  try {
    const cacheKey = `${req.user.id}:monthly`;

    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const monthlyData = await Transaction.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            type: "$type",
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    analyticsCache.set(cacheKey, monthlyData, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    res.json(monthlyData);
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/category-trend
// Returns monthly spending for a specific category (line chart).
// Cached per user+categoryName for 5 minutes.
// ---------------------------------------------------------------------------
router.get(
  "/category-trend",
  isLoggedIn,
  categoryTrendRules,
  validate,
  async (req, res) => {
    try {
      const { categoryName } = req.query;
      // Normalize before using as cache key to prevent cache fragmentation
      const normalizedName = categoryName.trim();
      const cacheKey = `${req.user.id}:trend:${normalizedName}`;

      const cached = analyticsCache.get(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached);
      }

      const category = await Category.findOne({
        name: normalizedName,
        user: req.user.id,
      });

      // Return empty array — no data is a valid state, not an error
      if (!category) {
        analyticsCache.set(cacheKey, [], CACHE_TTL_MS);
        res.setHeader("X-Cache", "MISS");
        return res.json([]);
      }

      const trendData = await Transaction.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(req.user.id),
            type: "expense",
            category: category._id,
          },
        },
        {
          $group: {
            _id: { year: { $year: "$date" }, month: { $month: "$date" } },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      analyticsCache.set(cacheKey, trendData, CACHE_TTL_MS);
      res.setHeader("X-Cache", "MISS");
      res.json(trendData);
    } catch (error) {
      console.error("Error fetching category trend:", error);
      res.status(500).json({ message: "Server Error" });
    }
  },
);

module.exports = router;
