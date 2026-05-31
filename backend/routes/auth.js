const express = require("express");
const passport = require("passport");
const router = express.Router();

// Route to start the Google OAuth flow
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

// Callback URL after Google sign-in
// Session fixation fix: regenerate the session ID AFTER successful authentication.
// Without this, an attacker can plant a known session cookie before the user logs in,
// then use that same cookie to act as the authenticated user post-login.
// regenerate() replaces the session ID while preserving session data.
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res, next) => {
    // Regenerate session ID to prevent session fixation
    const user = req.user;
    req.session.regenerate((err) => {
      if (err) return next(err);

      // Re-attach the user to the new session (Passport needs this)
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect("/dashboard");
      });
    });
  },
);

// Route to check if the user is logged in (used by frontend to get user info)
router.get("/me", (req, res) => {
  if (req.user) {
    res.status(200).json(req.user);
  } else {
    res.status(401).json({ message: "User is not logged in" });
  }
});

// Route to log the user out and destroy the session completely
router.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    // Destroy the session on the server AND clear the cookie on the client
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("Session destroy error:", destroyErr);
      }
      res.clearCookie("connect.sid"); // Default express-session cookie name
      res.redirect("/");
    });
  });
});

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const analyticsCache = require("../utils/cache");
const { isLoggedIn } = require("../middleware/authMiddleware");

// Route to delete the user account and all associated data
router.delete("/account", isLoggedIn, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // 1. Delete all transactions belonging to the user
    await Transaction.deleteMany({ user: userId });
    
    // 2. Delete the user record
    await User.findByIdAndDelete(userId);
    
    // 3. Clear any cached analytics for this user
    analyticsCache.delByPrefix(String(userId));
    
    // 4. Log out and destroy session
    req.logout(function (err) {
      if (err) return next(err);
      
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error("Session destroy error during account deletion:", destroyErr);
        }
        res.clearCookie("connect.sid");
        res.status(200).json({ message: "Account and all data successfully deleted." });
      });
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "An error occurred while deleting the account." });
  }
});

module.exports = router;
