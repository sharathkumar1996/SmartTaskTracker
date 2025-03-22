import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon to use WebSockets
neonConfig.webSocketConstructor = ws;

// Add a global error handler for URL constructor errors
// This is a common issue with Neon and DATABASE_URL format
const originalURLConstructor = global.URL;
global.URL = function(input: string | URL, base?: string | URL) {
  try {
    // Try to construct URL normally
    return new originalURLConstructor(input, base);
  } catch (error) {
    // Log the error but don't expose sensitive connection strings
    console.error(`URL Constructor Error: ${(error as Error).message}`);
    
    // Check if this is for a DATABASE_URL 
    if (typeof input === 'string' && input.includes('postgres')) {
      console.error('Error in getAuthCount: Invalid DATABASE_URL format detected');
      
      // For debugging in Render, add some diagnostics without revealing the full URL
      if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
        console.error('URL format issues:', {
          hasProtocol: input.startsWith('postgres://') || input.startsWith('postgresql://'),
          length: input.length,
          containsAtSign: input.includes('@'),
          containsColon: input.includes(':'),
          containsSlash: input.includes('/')
        });
      }
    }
    
    // Re-throw the error for the calling code to handle
    throw error;
  }
} as any;

// Enhanced error checking for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Validate DATABASE_URL format to avoid URL constructor errors
let connectionString = process.env.DATABASE_URL;
try {
  // Make sure the connection string can be parsed as a URL
  // This helps catch issues that would occur with the internal URL constructor
  new URL(connectionString);
} catch (error) {
  console.error("Invalid DATABASE_URL format:", error);
  
  // If we're in Render, try to provide more diagnostic information
  // but don't log the actual connection string for security
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    console.error("Render deployment detected. DATABASE_URL validation failed.");
    
    // Check if it begins with postgres:// or postgresql://
    const hasValidPrefix = connectionString.startsWith('postgres://') || 
                          connectionString.startsWith('postgresql://');
    
    if (!hasValidPrefix) {
      console.error("DATABASE_URL must start with postgres:// or postgresql://");
    }
    
    // Check length without logging the actual value
    console.error(`DATABASE_URL length: ${connectionString.length} chars`);
  }
  
  // Don't throw here, let the connection attempt fail with a more specific error
}

// Log connection attempt (without sensitive details)
console.log("Connecting to database...");

// Create connection pool with improved error handling and error monitoring
const poolConfig = { 
  connectionString: connectionString,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000 // Return an error after 10 seconds if connection not established
};

// Export the database connection objects
export const pool = new Pool(poolConfig);

// Monitor pool for errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Create and export Drizzle ORM instance
export const db = drizzle({ client: pool, schema });

// Log success
console.log("Database connection pool initialized");
