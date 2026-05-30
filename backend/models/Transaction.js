const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // Link to the user who owns this transaction
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The type of transaction
    type: {
      type: String,
      required: true,
      enum: ["income", "expense"],
    },
    // The category of the transaction
    category: {
      type: String,
      required: true,
      enum: ["Food", "Transport", "Groceries", "Utility", "Entertainment", "Other"],
      default: "Food",
    },
    // The amount of money — must be a positive number, enforced in validation middleware
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },
    // The date of the transaction
    date: {
      type: Date,
      required: true,
    },
    // A short description of the transaction
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description must be 200 characters or fewer"],
    },
  },
  {
    timestamps: true,
  },
);

// ---------------------------------------------------------------------------
// Indexes
//
// Without these, every query does a full collection scan (O(N) per user).
// These compound indexes allow MongoDB to jump directly to the right documents.
//
// { user, date } — covers the default transaction list (sorted by date desc)
// { user, type } — covers analytics summary aggregation (group by type)
// { user, category } — covers category-trend and expenses-by-category
//
// All three start with `user` because every query always filters by user first.
// ---------------------------------------------------------------------------
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ user: 1, category: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
