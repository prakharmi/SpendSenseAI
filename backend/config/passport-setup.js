const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

// handling how user innfo is stored in session cookie
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
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
            email: profile.emails[0].value,
            image: profile.photos[0].value,
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
