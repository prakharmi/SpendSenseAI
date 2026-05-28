/**
 * isLoggedIn middleware
 *
 * Protects both API endpoints and server-rendered page routes.
 * - API requests (Accept: application/json) get a 401 JSON response
 * - Page requests get redirected to the login page
 */
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  // If the client expects JSON (API call from JS), return 401
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res
      .status(401)
      .json({ message: "You must be logged in to perform this action." });
  }

  // For page navigations (browser directly hitting /dashboard), redirect to login
  res.redirect("/");
};

module.exports = { isLoggedIn };
