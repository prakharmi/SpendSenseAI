const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware/authMiddleware");
const {
  validate,
  transactionCreateRules,
  transactionBulkRules,
  transactionFilterRules,
  transactionIdRules,
} = require("../middleware/validationMiddleware");
const multer = require("multer");

const transactionController = require("../controllers/transactionController");

// ---------------------------------------------------------------------------
// Multer configuration
// 5MB file size limit + MIME type allowlist prevents memory exhaustion DoS
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = {
  receipt: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  pdf: ["application/pdf"],
};

const createUpload = (fieldName, allowedTypes) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(", ")}`));
      }
    },
  }).single(fieldName);

const receiptUpload = createUpload("receipt", ALLOWED_MIME_TYPES.receipt);
const pdfUpload = createUpload("pdf", ALLOWED_MIME_TYPES.pdf);

const handleMulterError = (uploader, handler) => {
  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      handler(req, res, next);
    });
  };
};

// ---------------------------------------------------------------------------
// Routes mapping to Controllers
// ---------------------------------------------------------------------------

// POST /api/transactions/upload-receipt
router.post(
  "/upload-receipt",
  isLoggedIn,
  handleMulterError(receiptUpload, transactionController.uploadReceipt)
);

// POST /api/transactions/import-pdf
router.post(
  "/import-pdf",
  isLoggedIn,
  handleMulterError(pdfUpload, transactionController.importPdf)
);

// POST /api/transactions/add-multiple
router.post(
  "/add-multiple",
  isLoggedIn,
  transactionBulkRules,
  validate,
  transactionController.addMultiple
);

// GET /api/transactions
router.get(
  "/",
  isLoggedIn,
  transactionFilterRules,
  validate,
  transactionController.getTransactions
);

// POST /api/transactions
router.post(
  "/",
  isLoggedIn,
  transactionCreateRules,
  validate,
  transactionController.addTransaction
);

// DELETE /api/transactions/:id
router.delete(
  "/:id",
  isLoggedIn,
  transactionIdRules,
  validate,
  transactionController.deleteTransaction
);

// GET /api/transactions/categories
router.get(
  "/categories",
  isLoggedIn,
  transactionController.getCategories
);

module.exports = router;
