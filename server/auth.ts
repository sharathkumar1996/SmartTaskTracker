import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import cors from "cors";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashedPassword = `${buf.toString("hex")}.${salt}`;
  return hashedPassword;
}

async function comparePasswords(supplied: string, stored: string) {
  if (!stored || !stored.includes('.')) {
    console.error("Invalid stored password format");
    return false;
  }

  const [hashed, salt] = stored.split(".");
  try {
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Password comparison error:", error);
    return false;
  }
}

export function setupAuth(app: Express) {
  // Special testing cookie for debugging session issues
  app.use((req, res, next) => {
    res.cookie('server_online', 'true', { 
      httpOnly: false, 
      maxAge: 60000,
      path: '/',
      sameSite: 'none',
      secure: true  // MUST be true when sameSite is 'none'
    });
    next();
  });
  
  // CORS is already configured in server/index.ts
  // We're removing the duplicate CORS configuration here

  // Ensure the SESSION_SECRET is set or use a default in development
  if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET not set in environment, using default for development');
    process.env.SESSION_SECRET = 'chitfund-dev-session-secret-' + Date.now();
  }

  // Enhanced session configuration optimized for development environment
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: true, // Always save the session to ensure persistence
    saveUninitialized: true, // Save uninitialized sessions to prevent lost sessions
    rolling: true, // Reset expiration with each request
    store: storage.sessionStore,
    name: 'chitfund.sid',
    cookie: {
      secure: false, // Must be false for non-HTTPS in Replit environment
      httpOnly: false, // Allow client-side access for development
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
      sameSite: 'lax' // Most compatible option for browsers
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Add session debugging middleware
  app.use((req, res, next) => {
    console.log('Session Debug:', {
      sessionId: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      user: req.user?.id,
      cookies: req.cookies
    });
    next();
  });

  passport.use(
    new LocalStrategy(async (username: string, password: string, done) => {
      try {
        console.log(`Login attempt: username=${username}`);
        
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`User not found: ${username}`);
          return done(null, false, { message: 'Invalid username or password' });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log(`Invalid password for user: ${username}`);
          return done(null, false, { message: 'Invalid username or password' });
        }

        console.log(`Successful authentication for user: ${username} (ID: ${user.id})`);
        return done(null, user);
      } catch (error) {
        console.error("Auth error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('Deserializing user:', id);
      const user = await storage.getUser(id);
      if (!user) {
        console.log('User not found during deserialization:', id);
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Allow first user to be admin
      const userCount = await storage.getUserCount();
      if (userCount === 0) {
        req.body.role = "admin";
      } else if (req.body.role === "agent" && (!req.user || req.user.role !== "admin")) {
        return res.status(403).json({ message: "Only admins can create agent accounts" });
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
        status: 'active'
      });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    // Validate that required fields exist
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ 
        message: "Missing required fields", 
        details: "Both username and password are required"
      });
    }

    console.log(`Login request received for username: ${req.body.username}`);
    console.log('Session ID at login start:', req.sessionID);
    
    // Simplified login flow
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Authentication error:", err);
        return next(err);
      }
      
      if (!user) {
        console.log(`Authentication failed for ${req.body.username}: ${info?.message}`);
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      
      req.login(user, (err) => {
        if (err) {
          console.error("Session creation error:", err);
          return next(err);
        }
        
        console.log('Login successful for user:', user.id, user.username);
        console.log('Session ID after login:', req.sessionID);
        console.log('Is authenticated:', req.isAuthenticated());
        
        // Persist the session immediately to avoid synchronization issues
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return next(err);
          }
          
          const { password, ...userWithoutPassword } = user;
          
          // Set multiple cookies to help with authentication tracking
          // Main session cookie is handled by express-session
          
          // Additional debugging cookie to track auth state in browser
          res.cookie('auth_success', 'true', { 
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            httpOnly: false, // Allow JavaScript access for auth status check
            path: '/'
            // Removed sameSite and secure for Replit environment
          });
          
          // Cookie with user info for improved client-side experience
          res.cookie('user_info', JSON.stringify({ 
            id: user.id,
            username: user.username,
            role: user.role
          }), { 
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            httpOnly: false, // Client needs access
            path: '/'
            // Removed sameSite and secure for Replit environment
          });
          
          console.log('Session saved, sending response');
          res.json(userWithoutPassword);
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    console.log('Logging out user:', userId);
    
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      
      // Destroy the session to ensure complete logout
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
          return next(err);
        }
        
        // Clear all authentication cookies with matching settings
        res.clearCookie('auth_success', { path: '/' });
        res.clearCookie('user_info', { path: '/' });
        res.clearCookie('chitfund.sid', { path: '/' });
        
        console.log('All cookies cleared, user logged out');
        res.status(200).json({ success: true, message: "Logout successful" });
      });
    });
  });

  app.get("/api/user", (req, res) => {
    console.log('GET /api/user - isAuthenticated:', req.isAuthenticated());
    console.log('GET /api/user - Session ID:', req.sessionID);
    console.log('GET /api/user - Request cookies:', req.cookies);
    console.log('GET /api/user - Request headers:', {
      cookie: req.headers.cookie,
      referer: req.headers.referer,
      origin: req.headers.origin
    });
    
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      // Enhanced error response with CORS headers to ensure client receives this properly
      console.log('GET /api/user - No authenticated user found');
      
      // If we have an auth_success cookie but no session, it's likely a session mismatch
      if (req.cookies.auth_success) {
        console.log('Authentication cookie found but no valid session - possible session expiration');
        // Clear stale cookies to force fresh login
        res.clearCookie('auth_success', { path: '/' });
        res.clearCookie('user_info', { path: '/' });
        
        return res.status(401).json({ 
          authenticated: false,
          message: "Session expired. Please log in again."
        });
      }
      
      return res.status(401).json({ 
        authenticated: false,
        message: "Not authenticated"
      });
    }
    
    // User is authenticated, refresh session to extend expiration
    req.session.touch();
    req.session.save((err) => {
      if (err) console.error('Error saving session during /api/user call:', err);
      
      console.log('GET /api/user - User found:', req.user?.id, req.user?.username);
      const { password, ...userWithoutPassword } = req.user!;
      
      res.json({
        ...userWithoutPassword,
        authenticated: true
      });
    });
  });
}