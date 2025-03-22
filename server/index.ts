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

// Enhanced CORS configuration for both development and production
// This configuration is crucial for cookie-based authentication across multiple domains
app.use(cors({
  origin: function(origin, callback) {
    // Always allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development mode
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Add your custom domain and common deployment platforms
    const allowedDomains = [
      // Local development
      'localhost',
      '127.0.0.1',
      // Replit domains
      '.replit.dev',
      '.repl.co',
      // Render domains
      '.onrender.com',
      // Your custom domain
      'srivasavifinancialservices.in',
      'www.srivasavifinancialservices.in'
    ];
    
    // Check if the origin matches any allowed domain
    const allowed = allowedDomains.some(domain => {
      if (domain.startsWith('.')) {
        // Handle wildcard subdomains
        return origin.includes(domain);
      } else {
        // Handle exact domain matches
        return origin.includes(`://${domain}`);
      }
    });
    
    if (allowed) {
      callback(null, true);
    } else {
      console.log(`CORS request from unauthorized domain: ${origin}`);
      // In production, we'll still allow it but log it
      callback(null, true);
    }
  },
  credentials: true, // Allow credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'X-Requested-With',
    'X-User-ID',
    'X-User-Role',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Set-Cookie', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials'],
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced middleware for Render.com deployments
// This needs to be added before setupAuth so it can set up the render-specific user
if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
  console.log("Configuring Render.com specific middleware");
  
  // Add Render authentication detection layer - checks for special headers
  app.use(async (req: any, res, next) => {
    // Skip if already authenticated
    if (req.user) {
      return next();
    }
    
    // Check for Render-specific custom auth headers
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    const userAuth = req.headers['x-user-auth'];
    
    if (userId && userRole && userAuth === 'true') {
      try {
        console.log(`Render auth: Attempting header-based authentication`, {
          userId,
          userRole,
          path: req.path
        });
        
        // Get user from database
        const userIdNum = parseInt(userId.toString(), 10);
        if (!isNaN(userIdNum)) {
          const { storage } = await import('./storage');
          const user = await storage.getUser(userIdNum);
          
          if (user && user.role === userRole.toString()) {
            console.log(`Render auth: User authenticated via headers: ${user.id}, ${user.username}`);
            
            // Either login the user or store in renderUser property
            if (req.login) {
              // Proper type casting for TypeScript
              const userWithPassword = user as unknown as Express.User;
              
              // Try to login directly
              req.login(userWithPassword, (err: any) => {
                if (err) {
                  console.error('Render auth: Failed to login user directly:', err);
                  // If direct login fails, use renderUser as fallback
                  req.renderUser = user;
                } else {
                  console.log('Render auth: Successfully logged in user with passport:', user.id);
                }
                return next();
              });
              
              // Don't call next() here - it's called in the login callback
              return;
            } else {
              // Fallback if req.login is not available for some reason
              console.log('Render auth: req.login not available, using renderUser property');
              req.renderUser = user;
            }
          }
        }
      } catch (err) {
        console.error('Render auth: Error processing header authentication', err);
      }
    }
    
    // Only proceed here if we didn't do req.login (which has its own next() call)
    next();
  });
}

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

// Function to check database connectivity
async function checkDatabaseConnectivity() {
  try {
    const { storage } = await import('./storage');
    
    // Just check if we can access the database
    const userCount = await storage.getUserCount();
    console.log('Database connection successful. User count:', userCount);
    
    return true;
  } catch (error) {
    console.error('Error connecting to database:', error);
    return false;
  }
}

(async () => {
  try {
    // Check for environment type
    const isProduction = process.env.NODE_ENV === 'production';
    const isRender = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
    const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG;
    
    console.log(`Environment detection: Production=${isProduction}, Render=${isRender}, Replit=${isReplit}`);
    
    // Check database connectivity before starting the server
    await checkDatabaseConnectivity();
    
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