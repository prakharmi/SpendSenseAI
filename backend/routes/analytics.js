const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware/authMiddleware");
const {
  validate,
  analyticsDateRangeRules,
  categoryTrendRules,
} = require("../middleware/validationMiddleware");

const analyticsController = require("../controllers/analyticsController");

// ---------------------------------------------------------------------------
// GET /api/analytics/summary
// ---------------------------------------------------------------------------
router.get(
  "/summary",
  isLoggedIn,
  analyticsDateRangeRules,
  validate,
  analyticsController.getSummary
);

// ---------------------------------------------------------------------------
// GET /api/analytics/expenses-by-category
// ---------------------------------------------------------------------------
router.get(
  "/expenses-by-category",
  isLoggedIn,
  analyticsDateRangeRules,
  validate,
  analyticsController.getExpensesByCategory
);

// ---------------------------------------------------------------------------
// GET /api/analytics/monthly-summary
// ---------------------------------------------------------------------------
router.get(
  "/monthly-summary",
  isLoggedIn,
  analyticsController.getMonthlySummary
);

// ---------------------------------------------------------------------------
// GET /api/analytics/category-trend
// ---------------------------------------------------------------------------
router.get(
  "/category-trend",
  isLoggedIn,
  categoryTrendRules,
  validate,
  analyticsController.getCategoryTrend
);

// ---------------------------------------------------------------------------
// POST /api/analytics/coach
// ---------------------------------------------------------------------------
router.post(
  "/coach",
  isLoggedIn,
  analyticsController.getFinancialAdvice
);

module.exports = router;
