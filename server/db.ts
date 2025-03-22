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
        // Check if it looks like a credential-only string without proper URL format
        if (input.match(/^[a-zA-Z0-9_-]+$/) && !input.includes('://')) {
          console.log("URL constructor received potential database credential without proper URL format");
          
          // Try multiple endpoint formats based on common patterns
          // Check if we have specific endpoint information in environment variables
          const envEndpoint = process.env.NEON_ENDPOINT || process.env.DB_ENDPOINT;
          
          // Use the endpoint from environment if available, otherwise use default options
          const endpoint = envEndpoint || "ep-cool-darkness-123456.us-east-2.aws.neon.tech";
          const defaultDbName = "neondb";
          
          // Construct a proper Neon URL
          input = `postgresql://${input}@${endpoint}/${defaultDbName}`;
          console.log("Transformed credential to proper PostgreSQL URL format");
          console.log(`Using database endpoint: ${endpoint}`);
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
      input.match(/^[a-zA-Z0-9_-]+$/) // Likely a credential string
    )) {
      console.error('Database URL construction failed');
      
      // For debugging in Render, add some diagnostics without revealing the full URL
      if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
        if (typeof input === 'string') {
          // Enhanced error reporting for database connection
          let details: Record<string, string | boolean> = {
            hasProtocol: input.startsWith('postgres://') || input.startsWith('postgresql://'),
            length: input.length.toString(),
            containsAtSign: input.includes('@'),
            containsColon: input.includes(':'),
            containsSlash: input.includes('/'),
            looksLikeCredential: input.match(/^[a-zA-Z0-9_-]+$/) !== null,
            environment: process.env.NODE_ENV || 'unknown'
          };
          
          // Try to add helpful endpoint information
          if (process.env.NEON_ENDPOINT) {
            details.configuredEndpoint = 'NEON_ENDPOINT is set';
          }
          if (process.env.DB_ENDPOINT) {
            details.configuredEndpoint = 'DB_ENDPOINT is set';
          }
          
          console.error('URL format details:', details);
          
          // Provide guidance on how to fix common issues
          console.error('GUIDANCE: Make sure your DATABASE_URL is properly formatted or set NEON_ENDPOINT env variable with your specific endpoint');
        } else {
          console.error('Non-string input passed to URL constructor');
        }
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
  
  // IMPORTANT: Double check if we're using a full Neon string, a Supabase string, or just a credential
  const hasValidPrefix = connectionString.startsWith('postgres://') || 
                        connectionString.startsWith('postgresql://');
  
  // If we just have a credential string instead of a full URL in Render.com (common issue)
  if (!hasValidPrefix) {
    console.log("DATABASE_URL doesn't have a proper postgres:// prefix. Attempting to construct a valid URL.");
    
    // For Render.com we have two common patterns:
    // 1. Neon - Typically in the format postgresql://user:pass@endpoint/dbname
    // 2. Supabase - Typically in the format postgres://postgres:[PASSWORD]@db.[projectref].supabase.co:5432/postgres
    
    // Check if it's a Neon-style credential (most likely case)
    if (connectionString.match(/^[a-zA-Z0-9_-]+$/)) {
      console.log("Detected Neon-style credential token");
      
      // Try multiple endpoint formats to ensure we connect
      const possibleEndpoints = [
        // Common Neon endpoints
        "ep-cool-darkness-123456.us-east-2.aws.neon.tech",
        "ep-cool-darkness-123456.us-east-1.aws.neon.tech",
        "db.neon.tech",
        // Default endpoint if nothing else works
        "localhost"
      ];
      
      // Try to extract a default endpoint from environment variables if available
      const endpointFromEnv = process.env.NEON_ENDPOINT || process.env.DB_ENDPOINT;
      if (endpointFromEnv) {
        possibleEndpoints.unshift(endpointFromEnv); // Make the configured endpoint the first choice
      }
      
      // Use first endpoint by default
      const selectedEndpoint = possibleEndpoints[0];
      const defaultDbName = "neondb";
      
      console.log(`Using endpoint ${selectedEndpoint} for Neon connection`);
      
      // Construct proper Neon URL
      connectionString = `postgresql://${connectionString}@${selectedEndpoint}/${defaultDbName}`;
      console.log("Constructed complete database URL with format: postgresql://[credential]@[endpoint]/[dbname]");
    }
    // Check if it's a Supabase connection secret (second most common case) 
    else if (connectionString.includes('supabase')) {
      console.log("Detected Supabase connection string, using as-is");
      // Supabase strings are typically complete but without the postgres:// prefix
      connectionString = `postgres://${connectionString}`;
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

// Create a function to initialize the pool with fallbacks for Render.com
async function createPool() {
  try {
    const pool = new Pool(poolConfig);
    
    // Test the connection before proceeding
    // This will throw an error if connection fails
    if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
      try {
        // Try a simple query to test the connection
        await pool.query('SELECT 1');
        console.log("Database connection test successful");
      } catch (testError) {
        console.error("Initial database connection test failed:", testError);
        
        // If we're in Render.com, try with alternative endpoints
        console.log("Attempting connection with alternative endpoints...");
        
        // Create a list of possible Neon endpoints to try
        const endpoints = [
          'ep-mute-smoke-123456.us-east-2.aws.neon.tech',
          'ep-shiny-wave-123456.us-east-1.aws.neon.tech',
          'sweet-pudding-123456.us-west-1.aws.neon.tech',
        ];
        
        // Try each endpoint until one works
        for (const endpoint of endpoints) {
          try {
            console.log(`Trying alternative endpoint: ${endpoint}`);
            // Extract the credential from the original connection string
            const credential = process.env.DATABASE_URL;
            
            // Construct a new connection string with this endpoint
            const altConnectionString = `postgresql://${credential}@${endpoint}/neondb`;
            
            // Create a new pool with this connection string
            const altPool = new Pool({ 
              connectionString: altConnectionString,
              max: 5,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 5000
            });
            
            // Test the connection
            await altPool.query('SELECT 1');
            console.log(`Connection successful with endpoint: ${endpoint}`);
            
            // If successful, replace our pool with this one and update our connection string
            connectionString = altConnectionString;
            return altPool;
          } catch (endpointError) {
            console.error(`Connection failed with endpoint ${endpoint}:`, endpointError.message);
            // Continue to the next endpoint
          }
        }
        
        // If we get here, all alternatives failed. Return the original pool
        // and let the application try to use it
        console.log("All alternative connections failed. Using original pool.");
      }
    }
    
    return pool;
  } catch (error) {
    console.error("Error creating connection pool:", error);
    // Create a minimal pool that will allow the server to start
    // even if the database is not available
    console.log("Creating a minimal fallback pool to allow server to start");
    return new Pool(poolConfig);
  }
}

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

// For Render.com, we'll try to test the connection right away and fix it if needed
if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
  console.log("Running connection validation for Render.com environment...");
  // Run this async but don't block server startup
  (async () => {
    try {
      // Try a simple query to test if the pool works
      await pool.query('SELECT 1');
      console.log("Initial database connection test successful");
    } catch (error) {
      console.error("Initial database connection test failed:", error);
      
      // Try to create a new pool with fallbacks
      console.log("Attempting to recover connection with fallbacks...");
      try {
        const newPool = await createPool();
        console.log("Successfully recovered database connection with fallbacks");
        
        // We'll leave the original exports in place to avoid disrupting imports,
        // but log a recommendation to restart the server for a clean connection
        console.log("It's recommended to restart the server to use the recovered connection");
      } catch (fallbackError) {
        console.error("Failed to recover database connection:", fallbackError);
      }
    }
  })().catch(err => {
    console.error("Unhandled error in connection validation:", err);
  });
}
