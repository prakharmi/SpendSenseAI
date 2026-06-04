const Transaction = require("../models/Transaction");
const analyticsCache = require("../utils/cache");
const aiService = require("../services/aiService");

const VALID_CATEGORIES = ["Food", "Transport", "Groceries", "Utility", "Entertainment", "Other"];
const normalizeCategory = (name) => {
  const normalized = (name || "Other").trim();
  const match = VALID_CATEGORIES.find(c => c.toLowerCase() === normalized.toLowerCase());
  return match || "Other";
};

const invalidateUserCache = (userId) => {
  const count = analyticsCache.delByPrefix(String(userId));
  if (count > 0) {
    console.log(`[Cache] Invalidated ${count} entries for user ${userId}`);
  }
};

exports.uploadReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }
    const data = await aiService.extractTextFromImage(req.file.buffer, req.file.mimetype);
    res.status(200).json({
      type: "expense",
      description: "Transaction from receipt",
      amount: data.amount,
      date: data.date,
      category: data.category,
    });
  } catch (error) {
    console.error("Error processing receipt:", error);
    res.status(500).json({
      message: error.message || "An internal server error occurred while processing the receipt.",
    });
  }
};

exports.importPdf = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: "No file was uploaded." });
  }
  try {
    const validTransactions = await aiService.extractTransactionsFromPdf(req.file.buffer, req.file.mimetype);
    res.status(200).json(validTransactions);
  } catch (error) {
    console.error("Error processing PDF:", error);
    res.status(500).json({
      message: error.message || "The AI model could not process this PDF. It may be in an unsupported format.",
    });
  }
};

exports.addMultiple = async (req, res) => {
  try {
    const { transactions } = req.body;
    const transactionDocs = transactions.map((t) => ({
      user: req.user.id,
      type: t.type,
      description: t.description.trim(),
      amount: t.amount,
      date: t.date,
      category: normalizeCategory(t.category),
    }));

    const savedTransactions = await Transaction.insertMany(transactionDocs);
    invalidateUserCache(req.user.id);
    res.status(201).json(savedTransactions);
  } catch (error) {
    console.error("Error adding multiple transactions:", error);
    res.status(500).json({ message: "Server error while adding transactions." });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { type, category: categoryName, dateRange, page = 1, limit = 10 } = req.query;
    const filter = { user: req.user.id };

    if (type && type !== "all") filter.type = type;
    if (categoryName && categoryName !== "all") {
      filter.category = normalizeCategory(categoryName);
    }

    if (dateRange && dateRange !== "all") {
      const startDate = new Date();
      if (dateRange === "week") startDate.setDate(startDate.getDate() - 7);
      else if (dateRange === "month") startDate.setMonth(startDate.getMonth() - 1);
      else if (dateRange === "3months") startDate.setMonth(startDate.getMonth() - 3);
      filter.date = { $gte: startDate };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [totalTransactions, transactions] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limitNum),
    ]);

    const totalPages = Math.ceil(totalTransactions / limitNum);
    res.status(200).json({ transactions, currentPage: pageNum, totalPages, totalTransactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server error." });
  }
};

exports.addTransaction = async (req, res) => {
  try {
    const { type, description, amount, date, category: categoryName } = req.body;
    const normalizedCatName = normalizeCategory(categoryName);
    
    const newTransaction = new Transaction({
      user: req.user.id,
      type,
      description: description.trim(),
      amount,
      date,
      category: normalizedCatName,
    });
    await newTransaction.save();

    invalidateUserCache(req.user.id);
    res.status(201).json(newTransaction);
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found." });
    }

    invalidateUserCache(req.user.id);
    res.status(200).json({ message: "Transaction deleted successfully." });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ message: "Server error while deleting transaction." });
  }
};

exports.getCategories = async (req, res) => {
  try {
    res.status(200).json(["Food", "Transport", "Groceries", "Utility", "Entertainment", "Other"]);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Server error while fetching categories." });
  }
};
