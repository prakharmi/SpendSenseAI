const express = require('express');
const passport = require('passport');
const router = express.Router();

// Route to start the Google OAuth flow
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// URL user will be redirected to after sign in
router.get('/google/callback', passport.authenticate('google', {
  successRedirect: '/dashboard',
  failureRedirect: '/'
}));

// Route to check if the user is logged in
router.get('/me', (req, res) => {
  if (req.user) {
    res.status(200).json(req.user);
  } else {
    res.status(401).json({ message: 'User is not logged in' });
  }
});

// Route to log the user out
router.get('/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

module.exports = router;