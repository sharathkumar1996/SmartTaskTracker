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

  // Enhanced session configuration specifically optimized for Render deployment
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: true, // Always save the session to ensure persistence
    saveUninitialized: true, // Save uninitialized sessions to prevent lost sessions
    rolling: true, // Reset expiration with each request
    store: storage.sessionStore,
    name: 'chitfund.sid',
    cookie: {
      secure: false, // Must be false for HTTP and Render development
      httpOnly: false, // Set to false to allow client-side access (needed for cross-domain)
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for longer sessions
      path: '/',
      sameSite: 'none' // 'none' is required for cross-domain cookies
    }
  };

  // Add middleware to ensure trust proxy settings for various deployment environments
  // This is essential for proper cookie functioning behind proxies (like Render)
  app.set("trust proxy", 1);
  
  // Set up environment-specific configurations
  // This will help with cookie settings in different environments
  const isProduction = process.env.NODE_ENV === 'production';
  const isRender = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
  const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG;
  
  console.log(`Environment detection: Production=${isProduction}, Render=${isRender}, Replit=${isReplit}`);
  
  // Update cookie settings based on environment
  if (isRender) {
    console.log('Render environment detected - adjusting cookie settings');
    sessionSettings.cookie = {
      ...sessionSettings.cookie,
      secure: true, // Render uses HTTPS
      sameSite: 'none' // Required for cross-domain
    };
  }
  
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
    
    // Check if running in Replit dev environment
    const isReplitDev = !!process.env.REPL_ID || !!process.env.REPL_SLUG;
    
    // Check for our custom auth headers
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    
    // For Replit development environment, add a temporary admin auto-login
    // This makes testing easier in development - ONLY USE IN DEV ENVIRONMENT!
    if (isReplitDev && req.path.startsWith('/api/')) {
      console.log(`Development environment detected, applying auto-admin for ${req.path}`);
      
      // Get the first admin user
      try {
        const admins = await storage.getUsersByRole('admin');
        
        if (admins && admins.length > 0) {
          const adminUser = admins[0];
          console.log(`Auto-admin authentication: Using admin ${adminUser.username} (${adminUser.id})`);
          
          // Manually set admin authentication for this request
          // Cast to full User type to satisfy TypeScript (password exists in DB user)
          const userWithPassword = adminUser as unknown as Express.User;
          req.login(userWithPassword, (err) => {
            if (err) {
              console.error("Error in dev auto-admin:", err);
            } else {
              console.log(`Dev auto-admin successful for ${req.path}`);
            }
            return next();
          });
          return; // Skip regular flow as we're handling it in the callback
        } 
      } catch (error) {
        console.error("Error in auto-admin lookup:", error);
      }
    }
    
    // Normal header-based auth flow
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
            // Cast to full User type to satisfy TypeScript (password exists in DB user)
            const userWithPassword = user as unknown as Express.User;
            req.login(userWithPassword, (err) => {
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

      // Cast to full User type to satisfy TypeScript
      const userWithPassword = user as unknown as Express.User;
      req.login(userWithPassword, (err) => {
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
      
      // Cast to full User type to satisfy TypeScript
      const userWithPassword = user as unknown as Express.User;
      req.login(userWithPassword, (err) => {
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
            // Add environment-specific cookie settings
            const cookieOptions: any = {
              maxAge: 24 * 60 * 60 * 1000, // 24 hours
              httpOnly: false, // Allow JavaScript access for auth status check
              path: '/',
              sameSite: isRender ? 'none' as const : 'lax' as const, // Use 'none' for cross-origin in Render
              secure: isRender // HTTPS is required for sameSite='none'
            };
            
            // Set auth success flag cookie with environment-specific settings
            res.cookie('auth_success', 'true', cookieOptions);
            
            // Fallback version specifically for cross-platform support
            res.cookie('manual_auth_success', 'true', { 
              maxAge: 24 * 60 * 60 * 1000, // 24 hours
              httpOnly: false,
              path: '/'
            });
            
            // Cookie with user info for client-side experience
            const userInfoCookie = JSON.stringify({ 
              id: user.id,
              username: user.username,
              role: user.role,
              fullName: user.fullName
            });
            
            // Set user info cookie with environment-specific settings
            res.cookie('user_info', userInfoCookie, cookieOptions);
            
            // For Render specifically, add special CORS headers in response
            if (isRender) {
              res.setHeader('Access-Control-Allow-Credentials', 'true');
              // Use the actual origin if available
              if (req.headers.origin) {
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
              }
            }
            
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
        
        // Clear all authentication cookies with environment-specific settings
        try {
          // Determine cookie clearing options based on environment
          const standardOptions = { path: '/' };
          const renderOptions = { 
            path: '/', 
            sameSite: 'none' as const, 
            secure: true 
          };
          
          // Use both standard and environment-specific clearing to ensure complete logout
          
          // Basic cookie clearing (works in most environments)
          res.clearCookie('auth_success', standardOptions);
          res.clearCookie('manual_auth_success', standardOptions);
          res.clearCookie('user_info', standardOptions);
          res.clearCookie('chitfund.sid', standardOptions);
          res.clearCookie('server_online', standardOptions);
          
          // Render/cross-domain specific cookie clearing
          res.clearCookie('auth_success', renderOptions);
          res.clearCookie('manual_auth_success', renderOptions);
          res.clearCookie('user_info', renderOptions);
          res.clearCookie('chitfund.sid', renderOptions);
          res.clearCookie('server_online', renderOptions);
          
          // Additional sameSite=lax specific clearing
          res.clearCookie('auth_success', { path: '/', sameSite: 'lax' });
          res.clearCookie('manual_auth_success', { path: '/', sameSite: 'lax' });
          res.clearCookie('user_info', { path: '/', sameSite: 'lax' });
          res.clearCookie('chitfund.sid', { path: '/', sameSite: 'lax' });
          
          // If we're in Render, also set CORS headers for the logout response
          if (isRender && req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
          }
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
      origin: req.headers.origin,
      'x-user-id': req.headers['x-user-id'],
      'x-user-role': req.headers['x-user-role'],
      'x-user-name': req.headers['x-user-name'],
      'x-user-auth': req.headers['x-user-auth'],
      'x-client-host': req.headers['x-client-host'],
      'x-deploy-type': req.headers['x-deploy-type']
    });
    
    // Debug environment information
    const isRender = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
    console.log(`Current environment: ${process.env.NODE_ENV || 'development'}, Render: ${isRender}`);
    
    // Check authentication from multiple sources
    // 1. First check standard session authentication (most reliable)
    if (req.isAuthenticated() && req.user) {
      console.log('User authenticated through session:', req.user.id, req.user.username);
      const { password, ...userWithoutPassword } = req.user;
      
      // Force save session to ensure it persists correctly
      req.session.save((err) => {
        if (err) console.error('Error saving session during /api/user call:', err);
      });
      
      return res.json({
        ...userWithoutPassword,
        authenticated: true
      });
    }
    
    // 2. Check for custom auth headers (for cross-domain where cookies fail)
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    const userName = req.headers['x-user-name'];
    const userAuth = req.headers['x-user-auth'];
    
    if (userId && userRole && userAuth === 'true') {
      console.log('Attempting header-based authentication:', userId, userName);
      
      try {
        // Convert userId to number
        const userIdNum = parseInt(userId.toString(), 10);
        
        if (!isNaN(userIdNum)) {
          // Try to get user from storage
          const user = await storage.getUser(userIdNum);
          
          if (user && user.role === userRole.toString()) {
            console.log('User authenticated via headers:', user.id, user.username);
            
            // Manually log user in to create session
            // Cast to full User type to satisfy TypeScript
            const userWithPassword = user as unknown as Express.User;
            req.login(userWithPassword, (err) => {
              if (err) {
                console.error('Error establishing session from headers:', err);
              } else {
                // Save session for future requests
                req.session.save();
              }
            });
            
            // Return user data (even if session save might fail)
            const { password, ...userWithoutPassword } = user;
            return res.json({
              ...userWithoutPassword,
              authenticated: true
            });
          } else {
            console.log('User not found or role mismatch with provided headers');
          }
        }
      } catch (err) {
        console.error('Error processing header authentication:', err);
      }
    }
    
    // 3. Check backup cookies as last resort
    const hasAuthCookie = req.cookies.auth_success === 'true';
    const hasManualAuthCookie = req.cookies.manual_auth_success === 'true';
    const hasUserInfoCookie = !!req.cookies.user_info;
    
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
              // Cast to full User type to satisfy TypeScript
              const userWithPassword = user as unknown as Express.User;
              return req.login(userWithPassword, (err) => {
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
    
    // No authentication found from any source
    return res.status(401).json({ 
      authenticated: false,
      message: "Not authenticated"
    });
  });
}