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
    // Set a testing cookie only in development mode with safer settings
    if (process.env.NODE_ENV !== 'production') {
      res.cookie('server_online', 'true', { 
        httpOnly: false, 
        maxAge: 60000,
        path: '/',
        sameSite: 'lax'
      });
    }
    next();
  });
  
  // CORS is already configured in server/index.ts
  // We're removing the duplicate CORS configuration here

  // Ensure the SESSION_SECRET is set or use a default in development
  if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET not set in environment, using default for development');
    process.env.SESSION_SECRET = 'chitfund-dev-session-secret-' + Date.now();
  }

  // Enhanced session configuration for both Replit and production environments
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: true, // Always save the session to ensure persistence
    saveUninitialized: true, // Save uninitialized sessions to prevent lost sessions
    rolling: true, // Reset expiration with each request
    store: storage.sessionStore,
    name: 'chitfund.sid',
    cookie: {
      secure: false, // Set to false to work in all environments including HTTP
      httpOnly: true, // Better security
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for longer sessions
      path: '/',
      sameSite: 'lax' // Lax is more compatible across browsers
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
  
  // Alternative authentication middleware using custom headers
  // This is used when cookies aren't working but we still need authentication
  app.use(async (req, res, next) => {
    // If already authenticated through session, continue
    if (req.isAuthenticated()) {
      return next();
    }
    
    // Check for our custom auth headers
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    
    if (userId && userRole) {
      try {
        console.log(`Using header-based auth: User ID ${userId}, Role: ${userRole}`);
        // Convert headers to expected types
        const userIdNum = parseInt(userId.toString(), 10);
        
        if (!isNaN(userIdNum)) {
          // Get the user from storage
          const user = await storage.getUser(userIdNum);
          
          if (user && user.role === userRole) {
            // Manually set user authentication
            req.login(user, (err) => {
              if (err) {
                console.error("Error in manual login:", err);
              } else {
                console.log(`Manual authentication successful for user ${user.username}`);
              }
              next();
            });
            return;
          }
        }
      } catch (error) {
        console.error("Header auth error:", error);
      }
    }
    
    // Continue without authentication if headers weren't valid
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
          
          try {
            // Set auth success flag cookie - both with and without sameSite/secure to ensure compatibility
            // Standard version
            res.cookie('auth_success', 'true', { 
              maxAge: 24 * 60 * 60 * 1000, // 24 hours
              httpOnly: false, // Allow JavaScript access for auth status check
              path: '/',
              sameSite: 'lax'
            });
            
            // Fallback version specifically for Replit environment
            res.cookie('manual_auth_success', 'true', { 
              maxAge: 24 * 60 * 60 * 1000, // 24 hours
              httpOnly: false,
              path: '/'
            });
            
            // Cookie with user info for client-side experience - standard version
            const userInfoCookie = JSON.stringify({ 
              id: user.id,
              username: user.username,
              role: user.role
            });
            
            res.cookie('user_info', userInfoCookie, { 
              maxAge: 24 * 60 * 60 * 1000, // 24 hours
              httpOnly: false, // Client needs access
              path: '/',
              sameSite: 'lax'
            });
            
            // Store the same session in local storage as a fallback
            console.log('Setting auth cookies', {
              'auth_success': 'true',
              'manual_auth_success': 'true',
              'user_info': userInfoCookie.substring(0, 30) + '...'
            });
          } catch (err) {
            console.error('Error setting cookies:', err);
            // Continue even if cookie setting fails
          }
          
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
        // Try multiple cookie clearing strategies to ensure complete logout
        try {
          // Standard version
          res.clearCookie('auth_success', { path: '/' });
          res.clearCookie('manual_auth_success', { path: '/' });
          res.clearCookie('user_info', { path: '/' });
          res.clearCookie('chitfund.sid', { path: '/' });
          res.clearCookie('server_online', { path: '/' });
          
          // Also try with explicit sameSite and secure settings
          res.clearCookie('auth_success', { path: '/', sameSite: 'lax' });
          res.clearCookie('manual_auth_success', { path: '/', sameSite: 'lax' });
          res.clearCookie('user_info', { path: '/', sameSite: 'lax' });
          res.clearCookie('chitfund.sid', { path: '/', sameSite: 'lax' });
          
          // And try with different formats to ensure all variants are cleared
          res.clearCookie('auth_success', { path: '/', sameSite: 'none', secure: true });
          res.clearCookie('user_info', { path: '/', sameSite: 'none', secure: true });
        } catch (err) {
          console.error('Error clearing cookies:', err);
          // Continue anyway
        }
        
        console.log('All cookies cleared, user logged out');
        res.status(200).json({ success: true, message: "Logout successful" });
      });
    });
  });

  app.get("/api/user", async (req, res) => {
    console.log('GET /api/user - isAuthenticated:', req.isAuthenticated());
    console.log('GET /api/user - Session ID:', req.sessionID);
    console.log('GET /api/user - Request cookies:', req.cookies);
    console.log('GET /api/user - Request headers:', {
      cookie: req.headers.cookie,
      referer: req.headers.referer,
      origin: req.headers.origin
    });
    
    // Check if user is authenticated via session
    if (!req.isAuthenticated() || !req.user) {
      // Enhanced error response with CORS headers to ensure client receives this properly
      console.log('GET /api/user - No authenticated user found in session');
      
      // Check for our backup authentication cookies - if they exist, we might have a session issue
      const hasAuthCookie = req.cookies.auth_success === 'true';
      const hasManualAuthCookie = req.cookies.manual_auth_success === 'true';
      const hasUserInfoCookie = !!req.cookies.user_info;
      
      // If we have auth cookies but no session, try to parse the user from cookies
      if (hasAuthCookie || hasManualAuthCookie || hasUserInfoCookie) {
        console.log('Auth cookies found but no valid session - attempting to recover');
        
        // Try to recover user data from cookie
        try {
          if (hasUserInfoCookie) {
            const userInfo = JSON.parse(req.cookies.user_info);
            if (userInfo && userInfo.id) {
              console.log('Found user info in cookie, attempting to load user:', userInfo.id);
              
              // If we can load the user, manually log them in
              const user = await storage.getUser(userInfo.id);
              if (user) {
                console.log('Successfully loaded user from cookie data:', user.id, user.username);
                
                // Regenerate session - this should fix any session issues
                return req.login(user, (err) => {
                  if (err) {
                    console.error('Error logging in user from cookie data:', err);
                    // Clear stale cookies
                    res.clearCookie('auth_success', { path: '/' });
                    res.clearCookie('manual_auth_success', { path: '/' });
                    res.clearCookie('user_info', { path: '/' });
                    
                    return res.status(401).json({ 
                      authenticated: false,
                      message: "Session expired. Please log in again."
                    });
                  }
                  
                  console.log('Successfully recreated session for user:', user.id);
                  const { password, ...userWithoutPassword } = user;
                  return res.json({
                    ...userWithoutPassword,
                    authenticated: true
                  });
                });
              }
            }
          }
        } catch (e) {
          console.error('Error parsing user info cookie:', e);
        }
        
        // If we got here, we couldn't recover the session
        // Clear stale cookies
        res.clearCookie('auth_success', { path: '/' });
        res.clearCookie('manual_auth_success', { path: '/' });
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