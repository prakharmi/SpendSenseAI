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
    // The category of the transaction(example- Food, Salary etc.)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    // The amount of money
    amount: {
      type: Number,
      required: true,
    },
    // The date of the transaction
    date: {
      type: Date,
      required: true,
    },
    // description
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
