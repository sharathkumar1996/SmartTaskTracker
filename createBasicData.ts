import { sql } from 'drizzle-orm';
import { db } from './server/db';
import { users, chitFunds, payments, fundMembers, financialTransactions } from './shared/schema';
import { hashPassword } from './server/auth';

// Clear all existing data except admin
async function clearData() {
  try {
    console.log('Clearing existing data...');
    await db.execute(sql`DELETE FROM payments`);
    await db.execute(sql`DELETE FROM fund_members`);
    await db.execute(sql`DELETE FROM financial_transactions`);
    await db.execute(sql`DELETE FROM accounts_receivable`);
    await db.execute(sql`DELETE FROM accounts_payable`);
    await db.execute(sql`DELETE FROM notifications`);
    await db.execute(sql`DELETE FROM chit_funds`);
    await db.execute(sql`DELETE FROM group_members`);
    await db.execute(sql`DELETE FROM member_groups`);
    await db.execute(sql`DELETE FROM users WHERE username != 'admin'`);
    console.log('Data cleared successfully');
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
}

// Create users with Telugu names
async function createUsers() {
  try {
    console.log('Creating users...');
    const teluguNames = [
      'Rama Rao', 'Krishna Murthy', 'Venkata Naidu', 'Satyanarayana Reddy', 
      'Lakshmi Devi', 'Sita Devi', 'Padma Rani', 'Savitri Devi',
      'Anand Rao', 'Ravi Kumar'
    ];
    
    const createdUsers = [];
    
    // Create 4 agents
    for (let i = 0; i < 4; i++) {
      const username = `agent${i+1}`;
      const fullName = teluguNames[i];
      const hashedPassword = await hashPassword('password123');
      
      const result = await db.insert(users).values({
        username,
        password: hashedPassword,
        fullName,
        email: `${username}@example.com`,
        phone: `+91${9000000001 + i}`,
        role: 'agent',
        status: 'active'
      }).returning();
      
      if (result.length > 0) {
        createdUsers.push(result[0]);
        console.log(`Created agent: ${fullName}`);
      }
    }
    
    // Create 6 members
    for (let i = 0; i < 6; i++) {
      const username = `member${i+1}`;
      const fullName = teluguNames[i+4];
      const hashedPassword = await hashPassword('password123');
      
      const result = await db.insert(users).values({
        username,
        password: hashedPassword,
        fullName,
        email: `${username}@example.com`,
        phone: `+91${9100000001 + i}`,
        role: 'member',
        status: 'active'
      }).returning();
      
      if (result.length > 0) {
        createdUsers.push(result[0]);
        console.log(`Created member: ${fullName}`);
      }
    }
    
    console.log(`Created ${createdUsers.length} users successfully`);
    return createdUsers;
  } catch (error) {
    console.error('Error creating users:', error);
    return [];
  }
}

// Create chit funds
async function createChitFunds() {
  try {
    console.log('Creating chit funds...');
    const funds = [];
    
    // Create 3 funds with different amounts
    const fundData = [
      { name: '1 Lakh Fund', amount: '100000', duration: 20 },
      { name: '2 Lakh Fund', amount: '200000', duration: 20 },
      { name: '5 Lakh Fund', amount: '500000', duration: 20 }
    ];
    
    for (let i = 0; i < fundData.length; i++) {
      const { name, amount, duration } = fundData[i];
      
      // Start date (6, 5, 4 months ago respectively)
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (6 - i));
      
      const result = await db.insert(chitFunds).values({
        name,
        amount,
        duration,
        startDate: startDate,
        commissionRate: '5.0',
        status: 'active',
        memberCount: 20
      }).returning();
      
      if (result.length > 0) {
        funds.push({...result[0], numMonths: 6 - i});
        console.log(`Created chit fund: ${name}`);
      }
    }
    
    console.log(`Created ${funds.length} chit funds successfully`);
    return funds;
  } catch (error) {
    console.error('Error creating chit funds:', error);
    return [];
  }
}

// Add members to chit funds and create payments
async function addMembersAndPayments(users, funds) {
  try {
    console.log('Adding members to funds and creating payments...');
    
    // Add each user to the first fund
    for (const user of users) {
      for (const fund of funds) {
        // Add user to fund
        await db.insert(fundMembers).values({
          userId: user.id,
          fundId: fund.id
        });
        
        console.log(`Added ${user.fullName} to ${fund.name}`);
        
        // Create monthly payments for the appropriate number of months
        const numMonths = fund.numMonths;
        
        for (let month = 1; month <= numMonths; month++) {
          const paymentDate = new Date(fund.startDate);
          paymentDate.setMonth(paymentDate.getMonth() + month - 1);
          
          const monthlyAmount = Math.round(parseInt(fund.amount) / fund.duration);
          
          await db.insert(payments).values({
            amount: monthlyAmount.toString(),
            paymentDate: paymentDate,
            paymentMethod: Math.random() > 0.3 ? 'cash' : 'bank_transfer',
            paymentType: 'monthly',
            monthNumber: month,
            userId: user.id,
            chitFundId: fund.id,
            notes: `Month ${month} payment`
          });
          
          console.log(`Created payment for ${user.fullName} in month ${month} for ${fund.name}`);
        }
      }
    }
    
    console.log('Added members and created payments successfully');
    return true;
  } catch (error) {
    console.error('Error adding members and payments:', error);
    return false;
  }
}

// Create financial transactions
async function createFinancialTransactions() {
  try {
    console.log('Creating financial transactions...');
    
    // Admin borrows money
    const adminBorrowDate = new Date();
    adminBorrowDate.setDate(adminBorrowDate.getDate() - 15);
    
    await db.insert(financialTransactions).values({
      amount: '50000',
      recordedBy: 1, // Admin user ID
      transactionType: 'admin_borrow',
      paymentMethod: 'cash',
      description: 'Admin borrowed from fund',
      transactionDate: adminBorrowDate
    });
    
    // Admin repays some money
    const adminRepayDate = new Date();
    adminRepayDate.setDate(adminRepayDate.getDate() - 7);
    
    await db.insert(financialTransactions).values({
      amount: '25000',
      recordedBy: 1,
      transactionType: 'admin_repay',
      paymentMethod: 'bank_transfer',
      description: 'Admin repaid to fund',
      transactionDate: adminRepayDate
    });
    
    // External loan
    const loanDate = new Date();
    loanDate.setMonth(loanDate.getMonth() - 2);
    
    await db.insert(financialTransactions).values({
      amount: '500000',
      recordedBy: 1,
      transactionType: 'external_loan',
      paymentMethod: 'bank_transfer',
      description: 'Bank loan at 24% interest',
      lenderName: 'SBI Bank',
      interestRate: '24',
      transactionDate: loanDate
    });
    
    console.log('Created financial transactions successfully');
    return true;
  } catch (error) {
    console.error('Error creating financial transactions:', error);
    return false;
  }
}

// Main function
async function createBasicData() {
  try {
    await clearData();
    const newUsers = await createUsers();
    const newFunds = await createChitFunds();
    await addMembersAndPayments(newUsers, newFunds);
    await createFinancialTransactions();
    
    // Verify created data
    const userCount = await db.select({ count: sql\`count(*)\` }).from(users);
    const fundCount = await db.select({ count: sql\`count(*)\` }).from(chitFunds);
    const paymentCount = await db.select({ count: sql\`count(*)\` }).from(payments);
    const transactionCount = await db.select({ count: sql\`count(*)\` }).from(financialTransactions);
    
    console.log('\nDATA SUMMARY:');
    console.log(\`- Users: \${userCount[0].count}\`);
    console.log(\`- Chit Funds: \${fundCount[0].count}\`);
    console.log(\`- Payments: \${paymentCount[0].count}\`);
    console.log(\`- Financial Transactions: \${transactionCount[0].count}\`);
    
    console.log('\n✅ Basic test data created successfully!');
    return true;
  } catch (error) {
    console.error('Fatal error creating data:', error);
    return false;
  }
}

// Run the script
createBasicData().then(() => process.exit(0)).catch(() => process.exit(1));