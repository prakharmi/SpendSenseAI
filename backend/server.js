// Import necessary packages
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const analyticsRoutes = require("./routes/analytics");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const MongoStore = require("connect-mongo");

// Load environment variables
dotenv.config();

require("./config/passport-setup");

const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");

const app = express();
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
  }),
);

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// API Routes
app.use("/api", apiLimiter);
app.use("/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/analytics", analyticsRoutes);

// Frontend Page Routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/dashboard");
  } else {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
  }
});

app.get("/dashboard", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "frontend", "dashboard", "dashboard.html"),
  );
});

app.get("/analytics", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "frontend", "analytics", "analytics.html"),
  );
});

app.use(express.static(path.join(__dirname, "..", "frontend")));

const DATABASE_URL = process.env.DATABASE_URL;

mongoose
  .connect(DATABASE_URL)
  .then(() => console.log("Successfully connected to MongoDB!"))
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error.message);
    process.exit(1);
  });

const PORT = process.env.PORT || 8080;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
