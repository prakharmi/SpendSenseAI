const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    // The name of the category(example- Groceries, salary etc.)
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // A link to the user who created this category
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // ObjectId refers to a document in the 'User'
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
