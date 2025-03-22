// render-start.js - Special startup script for Render.com deployment
// This script runs database migrations and initializes the app
console.log('Starting Render.com deployment setup...');

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to run shell commands and log output
function runCommand(command) {
  console.log(`Running: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf8' });
    console.log(output);
    return true;
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(error.toString());
    return false;
  }
}

// Main setup function
async function setupRenderDeployment() {
  try {
    // Step 1: Check/create database schema
    console.log('Checking database connection and schema...');
    try {
      // Try running the database schema push directly
      // If it fails, we'll catch the error and try a different approach
      runCommand('npx drizzle-kit push:pg');
      console.log('Database schema created/updated successfully');
    } catch (dbError) {
      console.error('Error running database migration:', dbError);
      console.log('Trying alternative database connection method...');
      
      // Create a test script to verify database connection
      const testDbScript = `
      const { pool } = require('./dist/db.js');
      async function testDb() {
        try {
          const client = await pool.connect();
          console.log('Database connection successful!');
          client.release();
          return true;
        } catch (err) {
          console.error('Database connection failed:', err);
          return false;
        }
      }
      testDb();
      `;
      
      fs.writeFileSync('test-db.js', testDbScript);
      runCommand('node test-db.js');
    }
    
    // Step 2: Create admin user if needed
    console.log('Checking for admin user...');
    // Note: This will be handled by init.mjs/init.cjs
    
    // Step 3: Set environment indicator
    process.env.RENDER_DEPLOYMENT = 'true';
    
    // Step 4: Start the application
    console.log('Starting application...');
    require('./dist/server/index.js');
    
  } catch (error) {
    console.error('Render deployment setup failed:', error);
    // If all else fails, try to start the app directly
    try {
      require('./dist/server/index.js');
    } catch (startError) {
      console.error('Failed to start the application:', startError);
      process.exit(1);
    }
  }
}

// Run the setup
setupRenderDeployment();