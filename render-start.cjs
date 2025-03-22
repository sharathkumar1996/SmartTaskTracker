// render-start.cjs - CommonJS version for Render.com
// This is a special startup script designed to run in CommonJS mode
console.log('Starting application in Render.com environment...');

// Import process to access environment variables
const process = require('process');

// Set environment variables for our deployment
process.env.RENDER_DEPLOYMENT = 'true';

// Attempt to run the database migration through drizzle-kit
try {
  console.log('Attempting to run database migrations...');
  require('child_process').execSync('npx drizzle-kit push:pg', {
    stdio: 'inherit'
  });
  console.log('Database migration completed successfully');
} catch (err) {
  console.error('Database migration failed, but continuing startup:', err.message);
}

// Import and start the application
console.log('Starting server...');
require('./dist/server/index.js');