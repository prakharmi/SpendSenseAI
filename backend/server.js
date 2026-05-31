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
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

// Load environment variables
dotenv.config();

// ---------------------------------------------------------------------------
// Startup Guard — fail fast if critical environment variables are missing.
// This prevents silent misconfigurations (e.g. undefined SESSION_SECRET
// which would let express-session accept any forged cookie).
// ---------------------------------------------------------------------------
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CALLBACK_URL",
  "GEMINI_API_KEY",
];
const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingVars.join(", ")}`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error("[FATAL] SESSION_SECRET must be at least 32 characters long.");
  process.exit(1);
}

require("./config/passport-setup");

const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");
const { isLoggedIn } = require("./middleware/authMiddleware");

const app = express();

// Compress all responses to reduce payload size and speed up network requests
app.use(compression());

// Required for accurate IP detection behind Render's reverse proxy
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Security: HTTP headers via helmet
// Content-Security-Policy is configured to allow Chart.js CDN and Google Fonts
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net", // Chart.js CDN
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Tailwind injects inline styles
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://lh3.googleusercontent.com", // Google profile pictures
          "https://ui-avatars.com",             // Fallback avatars
          "https://www.svgrepo.com",            // Google logo on login page
        ],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        // Prevent plugin embedding (Flash, etc.)
        mediaSrc: ["'none'"],
        // Upgrade insecure requests in production
        ...(process.env.NODE_ENV === "production" ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Prevent the browser from sniffing MIME types
    noSniff: true,
    // Prevent clickjacking by denying iframe embedding
    frameguard: { action: "deny" },
    // Enable HSTS only in production (HTTPS)
    hsts: process.env.NODE_ENV === "production"
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Control how much referrer info is included with requests
    // strict-origin-when-cross-origin: full URL for same-origin, only origin for cross-origin
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Cross-Origin policies to prevent Spectre-style attacks
    crossOriginEmbedderPolicy: false, // Keep false — breaks Google Fonts
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);

// ---------------------------------------------------------------------------
// Permissions-Policy: Deny browser APIs this app never uses.
// Prevents a successful XSS from accessing camera, microphone, geolocation.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  next();
});

// ---------------------------------------------------------------------------
// CORS: Only allow the specific deployed origin (or localhost for dev)
// Never use `origin: true` — that mirrors any origin including attackers' sites
// ---------------------------------------------------------------------------
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? [process.env.ALLOWED_ORIGIN]
  : ["http://localhost:8080", "http://127.0.0.1:8080"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin ONLY in development (same-origin server renders, Postman).
      // In production every legitimate browser request comes from ALLOWED_ORIGIN.
      if (!origin) {
        if (process.env.NODE_ENV === "production") {
          // In production, no-origin requests are allowed only from same server (no CORS header needed)
          return callback(null, false);
        }
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" })); // Prevent JSON body bomb attacks

// ---------------------------------------------------------------------------
// NoSQL Injection Prevention
// Strips keys containing '$' or '.' from req.body, req.query, req.params
// Prevents attacks like: { "email": { "$gt": "" } } which bypass auth in MongoDB
// Must run AFTER express.json() so the body has been parsed
// ---------------------------------------------------------------------------
// Express 5.x makes req.query a strict getter. We must make it writable first.
app.use((req, res, next) => {
  const query = req.query; // Trigger getter
  Object.defineProperty(req, "query", {
    value: query,
    configurable: true,
    enumerable: true,
    writable: true,
  });
  next();
});

app.use(mongoSanitize({
  replaceWith: "_", // Replace operators with underscore instead of silently deleting
  onSanitizeError: (req, res) => {
    res.status(400).json({ message: "Invalid characters detected in request data." });
  },
}));

// ---------------------------------------------------------------------------
// Rate Limiters
// ---------------------------------------------------------------------------

// General API limiter: 100 req / 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again after 15 minutes." },
});

// Auth limiter: 20 req / 15 min per IP — prevents OAuth endpoint hammering
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts, please try again later." },
});

// AI limiter: 10 req / 15 min per IP — Gemini calls are expensive
// Applied specifically to receipt and PDF import endpoints
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "AI processing limit reached. Please try again in 15 minutes." },
});

// AI Coach limiter: 3 req / 24 hours per IP
const aiCoachLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You have reached your daily limit of 3 AI analyses. Please try again tomorrow." },
});

// ---------------------------------------------------------------------------
// Session — secure configuration
// ---------------------------------------------------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // Persist sessions in MongoDB so they survive server restarts
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
    cookie: {
      // secure: true ensures cookie is ONLY sent over HTTPS (critical for Render)
      // In local dev (HTTP), set NODE_ENV=development to keep it working
      secure: process.env.NODE_ENV === "production",
      // lax: allows cookie to be sent on top-level navigations (OAuth redirect)
      sameSite: "lax",
      // 30 days — user stays logged in without re-authenticating
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // httpOnly: JS cannot read this cookie — prevents XSS cookie theft
      httpOnly: true,
    },
  }),
);

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// ---------------------------------------------------------------------------
// Keep-alive ping endpoint (for UptimeRobot)
// ---------------------------------------------------------------------------
app.get("/pleasedontsleep", (req, res) => {
  res.status(200).send("OK");
});

// ---------------------------------------------------------------------------
// API Routes (with appropriate rate limiters)
// ---------------------------------------------------------------------------
app.use("/auth", authLimiter, authRoutes);
app.use("/api/transactions/upload-receipt", aiLimiter);
app.use("/api/transactions/import-pdf", aiLimiter);
app.use("/api/analytics/coach", aiCoachLimiter);
app.use("/api", apiLimiter);
app.use("/api/transactions", transactionRoutes);
app.use("/api/analytics", analyticsRoutes);

// ---------------------------------------------------------------------------
// Frontend Page Routes
// Protected pages (/dashboard, /analytics) now require server-side auth
// This prevents unauthenticated users from even receiving the HTML
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/dashboard");
  } else {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
  }
});

// Auth-guarded page routes — isLoggedIn redirects to "/" if not authenticated
app.get("/dashboard", isLoggedIn, (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "frontend", "dashboard", "dashboard.html"),
  );
});

app.get("/analytics", isLoggedIn, (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "frontend", "analytics", "analytics.html"),
  );
});

// Static file serving with per-type cache headers
// HTML: no-store — auth-guarded pages must never be cached by browsers or proxies.
//        If cached, a logged-out user visiting /dashboard could see another user's page.
// CSS/JS: 1-hour max-age + stale-while-revalidate — safe because we don't content-hash
//          filenames (no build step). Browser revalidates hourly using ETag (304 if unchanged).
// Images/fonts: 7 days — rarely change.
app.use(
  express.static(path.join(__dirname, "..", "frontend"), {
    etag: true,        // Send ETag for efficient 304 Not Modified responses
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        // Never cache HTML — ensures users always get fresh auth-guarded page checks
        res.setHeader("Cache-Control", "no-store");
      } else if (filePath.endsWith("sw.js")) {
        // Service worker MUST NOT be cached — browser needs to check for updates on every load.
        // If cached, a bug in the SW would be permanently stuck with no way to update.
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        // Allow the SW to control the entire site scope (not just /sw.js directory)
        res.setHeader("Service-Worker-Allowed", "/");
      } else if (filePath.endsWith("manifest.json")) {
        // Manifest can be cached briefly — 1 hour is fine
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Content-Type", "application/manifest+json");
      } else if (filePath.endsWith(".css") || filePath.endsWith(".js")) {
        // Cache for 1 hour; serve stale for up to 24h while revalidating in background
        res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      } else if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(filePath)) {
        // Images and fonts change rarely — cache for 7 days
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  }),
);

// ---------------------------------------------------------------------------
// 404 Handler — catches any unmatched routes
// ---------------------------------------------------------------------------
app.use((req, res) => {
  // Return JSON for API requests, redirect to home for page requests
  if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
    return res.status(404).json({ message: "Resource not found." });
  }
  res.redirect("/");
});

// ---------------------------------------------------------------------------
// Global Error Handler — catches any unhandled errors from route handlers
// Must have 4 parameters to be recognized as an error handler by Express
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log the full error server-side for debugging
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Don't leak internal error details to the client in production
  const statusCode = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "An internal server error occurred."
      : err.message;

  res.status(statusCode).json({ message });
});

// ---------------------------------------------------------------------------
// Database Connection
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;

mongoose
  .connect(DATABASE_URL)
  .then(() => console.log("Successfully connected to MongoDB!"))
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error.message);
    process.exit(1);
  });

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// Render (and other PaaS providers) send SIGTERM before stopping a container.
// This ensures in-flight requests complete and the DB connection closes cleanly
// instead of being abruptly killed — prevents data corruption and lost writes.
// ---------------------------------------------------------------------------
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    mongoose.connection.close(false).then(() => {
      console.log("MongoDB connection closed.");
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
