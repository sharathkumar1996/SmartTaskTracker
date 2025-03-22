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
    // Special handling for Neon database strings in Render.com environment
    if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
      if (typeof input === 'string') {
        // Check if it looks like a credential-only string for Neon
        if (input.match(/^[a-zA-Z0-9]+$/) && !input.includes('://')) {
          console.log("URL constructor received potential Neon credential without proper URL format");
          
          // Use standard Neon endpoint format with the credential
          const neonEndpoint = "db.neon.tech";
          const defaultDbName = "main";
          
          // Construct a proper Neon URL
          input = `postgresql://${input}@${neonEndpoint}/${defaultDbName}`;
          console.log("Transformed input to proper Neon URL format");
        }
      }
    }
    
    // Try to construct URL with possibly modified input
    return new originalURLConstructor(input, base);
  } catch (error) {
    // Log the error but don't expose sensitive connection strings
    console.error(`URL Constructor Error: ${(error as Error).message}`);
    
    // Check if this is for a DATABASE_URL 
    if (typeof input === 'string' && (
      input.includes('postgres') || 
      input.match(/^[a-zA-Z0-9]+$/) // Likely a credential string
    )) {
      console.error('Database URL construction failed');
      
      // For debugging in Render, add some diagnostics without revealing the full URL
      if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
        console.error('URL format issues:', {
          hasProtocol: typeof input === 'string' && (
            input.startsWith('postgres://') || 
            input.startsWith('postgresql://')
          ),
          length: typeof input === 'string' ? input.length : 'unknown',
          containsAtSign: typeof input === 'string' && input.includes('@'),
          containsColon: typeof input === 'string' && input.includes(':'),
          containsSlash: typeof input === 'string' && input.includes('/')
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

// Special handling for Render.com deployment
if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
  console.log("Render deployment detected. Checking DATABASE_URL format...");
  
  // Check if it begins with postgres:// or postgresql://
  const hasValidPrefix = connectionString.startsWith('postgres://') || 
                        connectionString.startsWith('postgresql://');
  
  // If we just have a credential string instead of a full URL in Render.com (common issue)
  if (!hasValidPrefix) {
    console.log("DATABASE_URL doesn't have a proper postgres:// prefix. Attempting to construct a valid URL.");
    
    // Neon database connection string format
    // Try to construct a valid Neon database URL using the credential
    // Format is: postgresql://user:password@endpoint/database
    
    // Use standard Neon endpoint format with the credential
    const neonEndpoint = "db.neon.tech";
    const defaultDbName = "main";
    
    // If it looks like just a credential token, use it to construct a proper URL
    if (connectionString.match(/^[a-zA-Z0-9]+$/)) {
      console.log("Using credential token to construct Neon database URL");
      // This is likely a credential-only string; construct a proper URL
      // Neon format: postgresql://[user]:[password]@[neon_hostname]/[dbname]
      connectionString = `postgresql://${connectionString}@${neonEndpoint}/${defaultDbName}`;
      console.log("Constructed database URL with proper format");
    }
  }
  
  // Log information about the connection string (without exposing sensitive data)
  console.log(`DATABASE_URL format check: ${hasValidPrefix ? 'valid prefix' : 'fixed prefix'}, length: ${connectionString.length} chars`);
}

try {
  // Make sure the connection string can be parsed as a URL
  // This helps catch issues that would occur with the internal URL constructor
  new URL(connectionString);
  console.log("DATABASE_URL validation passed");
} catch (error) {
  console.error("Invalid DATABASE_URL format:", error);
  
  // If we're still having issues, try to provide more diagnostic information
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    console.error("DATABASE_URL validation failed even after attempted fixes.");
    // Don't log the actual connection string for security
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
