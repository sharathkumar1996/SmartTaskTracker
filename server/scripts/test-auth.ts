import { storage } from "../storage";
import { hashPassword } from "../auth";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Function copied from auth.ts since it's not exported
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

async function testAuth() {
  try {
    console.log("Testing authentication...");

    // Step 1: Try to retrieve the admin user
    const adminUser = await storage.getUserByUsername("admin");
    if (!adminUser) {
      console.error("Admin user not found!");
      return;
    }
    
    console.log("Admin user found with ID:", adminUser.id);
    console.log("Password hash:", adminUser.password);

    // Step 2: Test known password comparison
    const testPassword = "admin123"; // This should be the known admin password
    const isValid = await comparePasswords(testPassword, adminUser.password);
    
    console.log("Password validation result:", isValid);
    console.log("Password hash format check:", adminUser.password.includes('.'));
    
    // Step 3: Create a test password hash and verify it
    const newHash = await hashPassword(testPassword);
    console.log("New hash for same password:", newHash);
    
    const secondCheck = await comparePasswords(testPassword, newHash);
    console.log("Verification of new hash:", secondCheck);
    
    // Step 4: Let's update the admin password to ensure it's definitely "admin123"
    if (!isValid) {
      console.log("Updating admin password...");
      const hashedPassword = await hashPassword(testPassword);
      const updatedUser = await storage.updateUser(adminUser.id, {
        password: hashedPassword
      });
      
      console.log("Admin password updated:", !!updatedUser);
    }
  } catch (error) {
    console.error("Error in authentication test:", error);
  }
}

testAuth();