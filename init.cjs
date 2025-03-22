// init.cjs - CommonJS version of init.js for Render.com
const { storage } = require('./dist/storage.js');

async function initialize() {
  try {
    // Check if any users exist
    const count = await storage.getUserCount();
    if (count === 0) {
      console.log('Creating initial admin user...');
      await storage.createUser({
        username: 'admin',
        password: 'admin123',
        fullName: 'Admin User',
        email: 'admin@example.com',
        phone: '1234567890',
        role: 'admin',
        status: 'active'
      });
      console.log('Admin user created successfully');
    } else {
      console.log('Users already exist, skipping admin creation');
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

initialize();