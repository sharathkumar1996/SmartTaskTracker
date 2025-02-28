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
  // CORS is already configured in server/index.ts
  // We're removing the duplicate CORS configuration here

  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable must be set');
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true, // Allow sessions for non-logged in users
    store: storage.sessionStore,
    name: 'chitfund.sid',
    cookie: {
      secure: false, // For development - change to process.env.NODE_ENV === 'production' for production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax', // Allow cross-site requests in development
      path: '/' // Make sure cookies are valid across all paths
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
    console.log('Request cookies:', req.cookies);
    console.log('Request headers:', req.headers);
    
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Authentication error:", err);
        return next(err);
      }
      
      if (!user) {
        console.log(`Authentication failed for ${req.body.username}: ${info?.message}`);
        const message = info?.message || "Authentication failed";
        return res.status(401).json({ message });
      }
      
      req.login(user, (err) => {
        if (err) {
          console.error("Session creation error:", err);
          return next(err);
        }
        
        console.log('Login successful for user:', user.id, user.username);
        console.log('Session ID after login:', req.sessionID);
        console.log('Is authenticated:', req.isAuthenticated());
        
        const { password, ...userWithoutPassword } = user;
        
        // Set a success cookie to help debug session issues
        res.cookie('auth_success', 'true', { 
          maxAge: 60000, // 1 minute
          httpOnly: true,
          path: '/',
          sameSite: 'lax'
        });
        
        // Set another non-httpOnly cookie to verify in the browser
        res.cookie('visible_auth_success', 'true', { 
          maxAge: 60000, // 1 minute
          httpOnly: false,
          path: '/',
          sameSite: 'lax'
        });
        
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    console.log('Logging out user:', userId);
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
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
    
    if (!req.user) {
      console.log('GET /api/user - No user found in session');
      return res.sendStatus(401);
    }
    
    console.log('GET /api/user - User found:', req.user.id, req.user.username);
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
}