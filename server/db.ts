import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon to use WebSockets
neonConfig.webSocketConstructor = ws;

// Enhanced error checking for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Log connection attempt (without sensitive details)
console.log("Connecting to database...");

// Create connection pool with improved error handling and error monitoring
const poolConfig = { 
  connectionString: process.env.DATABASE_URL,
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
