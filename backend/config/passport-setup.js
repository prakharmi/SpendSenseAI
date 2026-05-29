const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

// M4 Fix: Store minimal user fields in the session cookie.
// This means deserializeUser NEVER hits MongoDB on every request —
// it reconstructs the user object directly from the session payload.
// Trade-off: if user data changes (displayName, image), the session
// reflects stale data until re-login. Acceptable for a personal finance app.
passport.serializeUser((user, done) => {
  // Store only what the frontend actually uses — keeps session payload minimal
  done(null, {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    image: user.image,
  });
});

passport.deserializeUser((sessionUser, done) => {
  // Reconstruct the user object from session data without hitting the DB.
  // The `id` field is what our routes use for DB queries (e.g. Transaction.find({ user: req.user.id }))
  done(null, sessionUser);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Use the absolute URL from env, NOT a relative path.
      // Relative paths let Passport resolve against the incoming Host header,
      // which can be spoofed by a proxy or attacker to redirect OAuth callbacks.
      callbackURL: process.env.CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      // This function is called after the user logs in with Google
      try {
        // Check if user already exists in our database
        let existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          // User already exists
          done(null, existingUser);
        } else {
          // If not, create a new user in our database
          const newUser = new User({
            googleId: profile.id,
            displayName: profile.displayName,
            email: profile.emails?.[0]?.value ?? null,
            // Null-safe: Google may return an empty photos array in rare cases.
            // Falling back to null lets the frontend use the ui-avatars fallback.
            image: profile.photos?.[0]?.value ?? null,
          });
          await newUser.save();
          done(null, newUser);
        }
      } catch (error) {
        done(error, null);
      }
    },
  ),
);
