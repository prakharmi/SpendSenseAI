const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // unique ID by google
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    // The user's name
    displayName: {
      type: String,
      required: true,
    },
    // The user's email
    email: {
      type: String,
      required: true,
      unique: true,
    },
    // URL to the user's profile picture
    image: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);

module.exports = User;
