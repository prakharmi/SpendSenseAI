const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    // If user is authenticated, proceed
    return next();
  }
  // If not authenticated, send an error response
  res
    .status(401)
    .json({ message: "You must be logged in to perform this action." });
};

module.exports = { isLoggedIn };
