const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
const analyticsCache = require("../utils/cache");
const aiService = require("../services/aiService");

const CACHE_TTL_MS = 5 * 60 * 1000;

const createDateFilter = (dateRange) => {
  if (!dateRange || dateRange === "all") return {};
  const startDate = new Date();
  if (dateRange === "week") startDate.setDate(startDate.getDate() - 7);
  else if (dateRange === "month") startDate.setMonth(startDate.getMonth() - 1);
  else if (dateRange === "3months") startDate.setMonth(startDate.getMonth() - 3);
  return { date: { $gte: startDate } };
};

exports.getSummary = async (req, res) => {
  try {
    const { dateRange = "all" } = req.query;
    const cacheKey = `${req.user.id}:summary:${dateRange}`;

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

    analyticsCache.set(cacheKey, result, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getExpensesByCategory = async (req, res) => {
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
        $project: {
          _id: 0,
          category: "$_id",
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
};

exports.getMonthlySummary = async (req, res) => {
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
};

exports.getCategoryTrend = async (req, res) => {
  try {
    const { categoryName } = req.query;
    const normalizedName = categoryName.trim();
    const cacheKey = `${req.user.id}:trend:${normalizedName}`;

    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const trendData = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          type: "expense",
          category: normalizedName,
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
};

exports.getFinancialAdvice = async (req, res) => {
  try {
    const { summaryData } = req.body;
    
    if (!summaryData) {
      return res.status(400).json({ message: "Summary data is required for analysis." });
    }

    // Fetch month-over-month data for the last 2-3 months to provide trend context
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const historicalData = await Transaction.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user.id), date: { $gte: threeMonthsAgo }, type: "expense" } },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            category: "$category"
          },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1, totalAmount: -1 } }
    ]);

    const enrichedContext = {
      currentView: summaryData,
      historicalTrends: historicalData
    };

    const advice = await aiService.generateFinancialAdvice(enrichedContext);
    res.json({ advice });
  } catch (error) {
    console.error("Error generating financial advice:", error);
    res.status(500).json({ message: error.message || "Failed to generate financial advice." });
  }
};
