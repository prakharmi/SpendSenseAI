const { body, query, param, validationResult } = require("express-validator");

/**
 * Reusable helper: reads the result of express-validator checks.
 * If any validation failed, returns a 400 with all error messages.
 * Otherwise calls next() to proceed to the route handler.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ---------------------------------------------------------------------------
// Transaction validators
// ---------------------------------------------------------------------------

/**
 * Rules for manually adding a single transaction (POST /api/transactions)
 */
const transactionCreateRules = [
  body("type")
    .isIn(["income", "expense"])
    .withMessage('Type must be "income" or "expense".'),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required.")
    .isLength({ max: 200 })
    .withMessage("Description must be 200 characters or fewer."),

  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be a positive number.")
    .custom((val) => val <= 10_000_000)
    .withMessage("Amount exceeds the maximum allowed value."),

  body("date")
    .isISO8601()
    .withMessage("Date must be a valid date (YYYY-MM-DD).")
    .custom((val) => {
      const inputDate = new Date(val);
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      return inputDate >= tenYearsAgo && inputDate <= oneYearFromNow;
    })
    .withMessage("Date must be within the last 10 years and not more than 1 year in the future."),

  body("category")
    .trim()
    .notEmpty()
    .withMessage("Category is required.")
    .isLength({ max: 100 })
    .withMessage("Category name must be 100 characters or fewer."),
];

/**
 * Rules for bulk-importing transactions (POST /api/transactions/add-multiple)
 */
const transactionBulkRules = [
  body("transactions")
    .isArray({ min: 1, max: 200 })
    .withMessage("Transactions must be a non-empty array of up to 200 items."),

  body("transactions.*.type")
    .isIn(["income", "expense"])
    .withMessage('Each transaction type must be "income" or "expense".'),

  body("transactions.*.description")
    .trim()
    .notEmpty()
    .withMessage("Each transaction must have a description.")
    .isLength({ max: 200 })
    .withMessage("Description must be 200 characters or fewer."),

  body("transactions.*.amount")
    .isFloat({ gt: 0 })
    .withMessage("Each transaction amount must be a positive number.")
    .custom((val) => val <= 10_000_000)
    .withMessage("Amount exceeds the maximum allowed value."),

  body("transactions.*.date")
    .isISO8601()
    .withMessage("Each transaction must have a valid date (YYYY-MM-DD)."),

  body("transactions.*.category")
    .trim()
    .notEmpty()
    .withMessage("Each transaction must have a category.")
    .isLength({ max: 100 })
    .withMessage("Category name must be 100 characters or fewer."),
];

/**
 * Rules for the GET /api/transactions query filters
 */
const transactionFilterRules = [
  query("type")
    .optional()
    .isIn(["all", "income", "expense"])
    .withMessage('Type filter must be "all", "income", or "expense".'),

  // H2 Fix: Validate category query param to prevent any attempt to pass
  // operator-like strings. mongo-sanitize already strips '$'/'.' keys but
  // defense-in-depth validates the value too.
  query("category")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Category filter must be 100 characters or fewer.")
    // Reject any value containing MongoDB operator chars that sneak past sanitize
    .not().matches(/[\$\.]/)
    .withMessage("Category filter contains invalid characters."),

  query("dateRange")
    .optional()
    .isIn(["all", "week", "month", "3months"])
    .withMessage('Date range must be "all", "week", "month", or "3months".'),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer."),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100."),
];

/**
 * Rules for DELETE /api/transactions/:id
 */
const transactionIdRules = [
  param("id")
    .isMongoId()
    .withMessage("Invalid transaction ID format."),
];

// ---------------------------------------------------------------------------
// Analytics validators
// ---------------------------------------------------------------------------

const analyticsDateRangeRules = [
  query("dateRange")
    .optional()
    .isIn(["all", "week", "month", "3months"])
    .withMessage('Date range must be "all", "week", "month", or "3months".'),
];

const categoryTrendRules = [
  query("categoryName")
    .trim()
    .notEmpty()
    .withMessage("Category name is required.")
    .isLength({ max: 100 })
    .withMessage("Category name must be 100 characters or fewer."),
];

module.exports = {
  validate,
  transactionCreateRules,
  transactionBulkRules,
  transactionFilterRules,
  transactionIdRules,
  analyticsDateRangeRules,
  categoryTrendRules,
};
