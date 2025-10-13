const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware/authMiddleware");
const Transaction = require("../models/Transaction");
const Category = require("../models/Category");
const mongoose = require("mongoose");

// create a date filter based on a range string ("all","past week" etc).
// returns a date filtered object for the given mongodb query
const createDateFilter = (dateRange) => {
  if (!dateRange || dateRange === "all") {
    return {}; // No date filter
  }

  const startDate = new Date();
  if (dateRange === "week") {
    startDate.setDate(startDate.getDate() - 7);
  } else if (dateRange === "month") {
    startDate.setMonth(startDate.getMonth() - 1);
  } else if (dateRange === "3months") {
    startDate.setMonth(startDate.getMonth() - 3);
  }
  return { date: { $gte: startDate } };
};

// GET /api/analytics/summary
// Get a summary of total income, expenses, and net savings for a given time range.
router.get("/summary", isLoggedIn, async (req, res) => {
  try {
    const { dateRange } = req.query;
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
    res.json(result);
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/analytics/expenses-by-category
// Get total expenses grouped by category for a given time range
router.get("/expenses-by-category", isLoggedIn, async (req, res) => {
  try {
    const { dateRange } = req.query;
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
    res.json(expensesByCategory);
  } catch (error) {
    console.error("Error fetching expenses by category:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/analytics/monthly-summary
// Get monthly income vs expense for the last 12 months
router.get("/monthly-summary", isLoggedIn, async (req, res) => {
  try {
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
    res.json(monthlyData);
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/analytics/category-trend
// Get spending trend for a specific category
router.get("/category-trend", isLoggedIn, async (req, res) => {
  try {
    const { categoryName } = req.query;
    if (!categoryName)
      return res.status(400).json({ message: "Category name is required." });
    const category = await Category.findOne({
      name: categoryName,
      user: req.user.id,
    });
    if (!category) return res.json([]);
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
    res.json(trendData);
  } catch (error) {
    console.error("Error fetching category trend:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
