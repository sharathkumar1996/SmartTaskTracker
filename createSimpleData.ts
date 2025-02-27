import { sql } from 'drizzle-orm';
import { db } from './server/db';
import { users, chitFunds, payments, fundMembers, financialTransactions } from './shared/schema';
import { hashPassword } from './server/auth';

// Clear existing data
async function clearData() {
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
}

// Create users
async function createUsers() {
  console.log('Creating users...');
  const teluguNames = [
    'Rama Rao', 'Krishna Murthy', 'Satyanarayana Reddy', 'Venkata Naidu',
    'Lakshmi Devi', 'Sita Devi', 'Padma Rani', 'Savitri Devi'
  ];
  
  const createdUsers = [];
  
  // Create 2 agents
  for (let i = 0; i < 2; i++) {
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
    const fullName = teluguNames[i+2];
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
}

// Create chit funds
async function createChitFunds() {
  console.log('Creating chit funds...');
  const fundNames = ['1 Lakh Fund', '2 Lakh Fund'];
  const fundAmounts = [100000, 200000];
  const funds = [];
  
  for (let i = 0; i < fundNames.length; i++) {
    const amount = fundAmounts[i];
    const duration = 20;
    
    // Start date 3 months ago
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    
    // End date is duration months after start date
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + duration);
    
    // Monthly contribution is amount divided by duration
    const monthlyContribution = amount / duration;
    
    // Monthly bonus = 1% of the total amount
    const monthlyBonus = amount * 0.01;
    
    // Base commission = 5% of the total amount (5k per 1 lakh)
    const baseCommission = amount * 0.05;
    
    const result = await db.insert(chitFunds).values({
      name: fundNames[i],
      amount,
      duration,
      startDate,
      endDate,
      monthlyContribution,
      monthlyBonus,
      baseCommission,
      memberCount: 20,
      status: 'active'
    }).returning();
    
    if (result.length > 0) {
      funds.push(result[0]);
      console.log(`Created chit fund: ${fundNames[i]}`);
    }
  }
  
  console.log(`Created ${funds.length} chit funds successfully`);
  return funds;
}

// Add members and create payments
async function addMembersAndPayments(users, funds) {
  console.log('Adding members and creating payments...');
  const members = [];
  
  // Add each user to each fund
  for (const user of users) {
    for (const fund of funds) {
      // Add user to fund
      await db.insert(fundMembers).values({
        userId: user.id,
        fundId: fund.id,
        isWithdrawn: false,
        totalBonusReceived: '0',
        totalCommissionPaid: '0'
      }).returning();
      
      console.log(`Added ${user.fullName} to ${fund.name}`);
      
      // Create 2 monthly payments for each user in each fund
      for (let month = 1; month <= 2; month++) {
        const paymentDate = new Date(fund.startDate);
        paymentDate.setMonth(paymentDate.getMonth() + month - 1);
        
        await db.insert(payments).values({
          userId: user.id,
          chitFundId: fund.id,
          amount: fund.monthlyContribution.toString(),
          monthNumber: month,
          paymentType: 'monthly',
          paymentMethod: Math.random() > 0.5 ? 'cash' : 'google_pay',
          paymentDate,
          recordedBy: 1, // Admin user
          notes: `Month ${month} payment`
        });
        
        console.log(`Created month ${month} payment for ${user.fullName} in ${fund.name}`);
      }
    }
  }
  
  console.log('Members and payments created successfully');
  return members;
}

// Create financial transactions
async function createFinancialTransactions() {
  console.log('Creating financial transactions...');
  
  // Admin borrow
  const borrowDate = new Date();
  borrowDate.setDate(borrowDate.getDate() - 15);
  
  await db.insert(financialTransactions).values({
    amount: '50000',
    transactionDate: borrowDate,
    transactionType: 'admin_borrow',
    paymentMethod: 'cash',
    description: 'Admin borrowed from fund',
    recordedBy: 1
  });
  
  // Admin repay
  const repayDate = new Date();
  repayDate.setDate(repayDate.getDate() - 5);
  
  await db.insert(financialTransactions).values({
    amount: '25000',
    transactionDate: repayDate,
    transactionType: 'admin_repay',
    paymentMethod: 'bank_transfer',
    description: 'Admin repaid to fund',
    recordedBy: 1
  });
  
  // External loan
  const loanDate = new Date();
  loanDate.setMonth(loanDate.getMonth() - 2);
  
  await db.insert(financialTransactions).values({
    amount: '100000',
    transactionDate: loanDate,
    transactionType: 'external_loan',
    paymentMethod: 'bank_transfer',
    description: 'Loan from HDFC Bank',
    lenderName: 'HDFC Bank',
    interestRate: '24',
    recordedBy: 1
  });
  
  console.log('Financial transactions created successfully');
}

// Main function
async function createSimpleData() {
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
    
    console.log('\n===== DATA SUMMARY =====');
    console.log(`Users: ${userCount[0].count}`);
    console.log(`Chit Funds: ${fundCount[0].count}`);
    console.log(`Payments: ${paymentCount[0].count}`);
    console.log(`Financial Transactions: ${transactionCount[0].count}`);
    
    console.log('\n✅ Data created successfully!');
    return true;
  } catch (error) {
    console.error('Error creating data:', error);
    return false;
  }
}

// Run the script
createSimpleData().then(() => {
  console.log('Script completed successfully');
  process.exit(0);
}).catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});