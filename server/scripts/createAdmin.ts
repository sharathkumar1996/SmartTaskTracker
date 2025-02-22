import { storage } from "../storage";
import { hashPassword } from "../auth";

async function createAdminUser() {
  try {
    const hashedPassword = await hashPassword("admin123");
    const adminUser = await storage.createUser({
      username: "admin",
      password: hashedPassword,
      role: "admin",
      fullName: "System Admin",
      email: "admin@chitfund.com",
      phone: "1234567890",
      status: "active"
    });
    console.log("Admin user created successfully:", adminUser);
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
}

createAdminUser();
