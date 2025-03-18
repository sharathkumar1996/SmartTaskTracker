import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import { setupAuth } from "./auth";

const app = express();

// Enhanced logging middleware for debugging
app.use((req, res, next) => {
  // Log all requests including auth-related headers (but sanitize sensitive data)
  log(`REQUEST: ${req.method} ${req.path}`);
  
  // Log relevant headers for troubleshooting session/cookie issues
  const relevantHeaders = {
    cookie: req.headers.cookie ? "Cookie present" : "No cookie", // Don't log actual cookie values
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host,
    accept: req.headers.accept
  };
  
  log(`Headers: ${JSON.stringify(relevantHeaders)}`);
  
  next();
});

// Enhanced CORS configuration for development
// This exact configuration is crucial for cookie-based authentication
app.use(cors({
  origin: function (origin, callback) {
    // In development, allow all origins
    callback(null, true);
  },
  credentials: true, // Allow credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['set-cookie'], // Important for cookie transmission
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup auth after CORS configuration
setupAuth(app);

// Response tracking middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `RESPONSE: ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Only log response body for non-sensitive endpoints
      if (capturedJsonResponse && !path.includes("login") && !path.includes("register")) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      } else if (capturedJsonResponse) {
        logLine += ` :: [Response data omitted for security]`;
      }

      if (logLine.length > 120) {
        logLine = logLine.slice(0, 119) + "…";
      }

      log(logLine);
      
      // Log response headers for auth-related endpoints
      if (path.includes("login") || path.includes("logout") || path.includes("/api/user")) {
        log(`Response headers: ${JSON.stringify(res.getHeaders())}`);
      }
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      log(`Error: ${message}`);
      res.status(status).json({ message });
    });

    if (process.env.NODE_ENV !== "production") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
    server.listen(port, "0.0.0.0", () => {
      log(`Server started successfully on port ${port}`);
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log(`Error: Port ${port} is already in use`);
        process.exit(1);
      } else {
        log(`Server error: ${error.message}`);
        throw error;
      }
    });
  } catch (error) {
    log(`Failed to start server: ${error}`);
    process.exit(1);
  }
})();