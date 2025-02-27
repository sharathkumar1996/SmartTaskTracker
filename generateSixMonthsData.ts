import { sql } from 'drizzle-orm';
import { db } from './server/db';
import { users, chitFunds, payments, fundMembers, financialTransactions } from './shared/schema';
import { hashPassword } from './server/auth';

// Clear all existing data
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
  console.log('Data cleared.');
}

// Create 10 users with Telugu names
async function createUsers() {
  const teluguNames = [
    'Aadhya Reddy', 'Ananya Sharma', 'Arjun Patel', 
    'Kavya Nair', 'Dhruv Varma', 'Lakshmi Devi',
    'Krishnan Iyer', 'Saanvi Rao', 'Vikram Singh', 'Meera Nair'
  ];
  
  const createdUserIds: number[] = [];
  console.log('Creating users...');
  
  for (let i = 0; i < teluguNames.length; i++) {
    const fullName = teluguNames[i];
    const username = `member${i + 1}`;
    const email = `${username.toLowerCase()}@example.com`;
    const phone = `+91${9000000000 + i}`;
    const hashedPassword = await hashPassword('password123');
    const role = i < 2 ? 'agent' : 'member'; // First 2 are agents
    
    const result = await db.insert(users).values({
      username,
      password: hashedPassword,
      fullName,
      email,
      phone,
      role,
      status: 'active'
    }).returning({ id: users.id });
    
    if (result && result.length > 0) {
      createdUserIds.push(result[0].id);
      console.log(`Created user: ${fullName}`);
    }
  }
  
  console.log(`Created ${createdUserIds.length} users`);
  return createdUserIds;
}

// Create 4 chit funds
async function createChitFunds() {
  const chitFundAmounts = [100000, 200000, 500000, 1000000]; // 1L, 2L, 5L, 10L
  const createdFunds: any[] = [];
  console.log('Creating chit funds...');
  
  for (let i = 0; i < chitFundAmounts.length; i++) {
    const amount = chitFundAmounts[i];
    const lakhs = amount / 100000;
    const name = `${lakhs} Lakh Fund ${i + 1}`;
    
    // Start date - x months ago
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6); // 6 months ago
    
    const result = await db.insert(chitFunds).values({
      name,
      amount: amount.toString(),
      duration: 20, // 20 months duration
      startDate: startDate.toISOString(),
      commissionRate: '5.0', // 5% commission
      status: 'active'
    }).returning({ id: chitFunds.id });
    
    if (result && result.length > 0) {
      createdFunds.push({
        id: result[0].id,
        name,
        amount,
        startDate
      });
      console.log(`Created chit fund: ${name}`);
    }
  }
  
  console.log(`Created ${createdFunds.length} chit funds`);
  return createdFunds;
}

// Add members to funds
async function addMembers(userIds: number[], funds: any[]) {
  console.log('Adding members to funds...');
  
  for (const fund of funds) {
    // Add 5 members to each fund
    for (let i = 0; i < 5; i++) {
      if (i < userIds.length) {
        await db.insert(fundMembers).values({
          userId: userIds[i],
          fundId: fund.id,
          isWithdrawn: false,
          earlyWithdrawalMonth: null
        });
        console.log(`Added user ${userIds[i]} to fund ${fund.id}`);
      }
    }
  }
}

// Create payments for 6 months
async function createPayments(funds: any[]) {
  console.log('Creating payments for 6 months...');
  
  for (const fund of funds) {
    const monthlyAmount = Math.round(fund.amount / 20); // Each month's payment
    
    // Get members for this fund
    const members = await db.select().from(fundMembers).where(sql`fund_id = ${fund.id}`);
    
    // For each of the past 6 months
    for (let month = 1; month <= 6; month++) {
      const paymentDate = new Date(fund.startDate);
      paymentDate.setMonth(paymentDate.getMonth() + month - 1);
      
      // One member withdraws each month (if we have enough members)
      if (month <= members.length) {
        const withdrawalMember = members[month - 1];
        
        // Mark as withdrawn
        await db.update(fundMembers)
          .set({
            isWithdrawn: true,
            earlyWithdrawalMonth: month,
            totalCommissionPaid: Math.round(fund.amount * 0.05).toString() // 5% commission
          })
          .where(sql`fund_id = ${fund.id} AND user_id = ${withdrawalMember.userId}`);
        
        // Add withdrawal payment
        const commissionAmount = Math.round(fund.amount * 0.05);
        const withdrawalAmount = fund.amount - commissionAmount;
        
        await db.insert(payments).values({
          userId: withdrawalMember.userId,
          chitFundId: fund.id,
          amount: withdrawalAmount.toString(),
          paymentType: 'withdrawal',
          paymentDate: paymentDate.toISOString(),
          paymentMethod: 'bank_transfer',
          monthNumber: month,
          commission: commissionAmount.toString(),
          notes: `Withdrawal for month ${month}`
        });
        
        console.log(`Created withdrawal for user ${withdrawalMember.userId} in month ${month}`);
      }
      
      // Monthly payments from all non-withdrawn members
      for (const member of members) {
        // Skip if already withdrawn
        if (member.isWithdrawn && member.earlyWithdrawalMonth && member.earlyWithdrawalMonth <= month) {
          continue;
        }
        
        // Add monthly payment (80% cash, 20% digital)
        const paymentMethod = Math.random() > 0.2 ? 'cash' : 'bank_transfer';
        
        await db.insert(payments).values({
          userId: member.userId,
          chitFundId: fund.id,
          amount: monthlyAmount.toString(),
          paymentType: 'monthly',
          paymentDate: paymentDate.toISOString(),
          paymentMethod,
          monthNumber: month,
          notes: `Monthly payment for month ${month}`
        });
        
        console.log(`Created monthly payment for user ${member.userId} in month ${month}`);
      }
    }
  }
}

// Create financial transactions
async function createTransactions(userIds: number[]) {
  console.log('Creating financial transactions...');
  
  // Admin borrow
  await db.insert(financialTransactions).values({
    transactionDate: new Date().toISOString(),
    amount: '50000',
    transactionType: 'admin_borrow',
    paymentMethod: 'cash',
    description: 'Admin borrowed from chit fund',
    recordedBy: 1,
    gstEligible: false
  });
  
  // Admin repay
  await db.insert(financialTransactions).values({
    transactionDate: new Date().toISOString(),
    amount: '25000',
    transactionType: 'admin_repay',
    paymentMethod: 'bank_transfer',
    description: 'Admin repaid to chit fund',
    recordedBy: 1,
    gstEligible: false
  });
  
  // External loan with 24% interest
  await db.insert(financialTransactions).values({
    transactionDate: new Date().toISOString(),
    amount: '500000',
    transactionType: 'external_loan',
    paymentMethod: 'bank_transfer',
    lenderName: 'HDFC Bank',
    interestRate: '24',
    description: 'External loan for business operations',
    recordedBy: 1,
    gstEligible: false
  });
  
  // Loan repayment
  await db.insert(financialTransactions).values({
    transactionDate: new Date().toISOString(),
    amount: '100000',
    transactionType: 'loan_repayment',
    paymentMethod: 'bank_transfer',
    lenderName: 'HDFC Bank',
    description: 'Loan repayment',
    recordedBy: 1,
    gstEligible: false
  });
  
  // Agent salary (for first 2 users)
  for (let i = 0; i < 2 && i < userIds.length; i++) {
    await db.insert(financialTransactions).values({
      transactionDate: new Date().toISOString(),
      amount: '20000',
      transactionType: 'agent_salary',
      paymentMethod: 'bank_transfer',
      agentId: userIds[i],
      description: 'Monthly salary for agent',
      recordedBy: 1,
      gstEligible: false
    });
  }
  
  // GST eligible expenses
  const expenses = [
    { name: 'Office Rent', amount: 15000, hsn: '997212', gstRate: 18 },
    { name: 'Software Services', amount: 10000, hsn: '998314', gstRate: 18 },
    { name: 'Office Supplies', amount: 5000, hsn: '4823', gstRate: 12 }
  ];
  
  for (const expense of expenses) {
    const gstAmount = Math.round(expense.amount * expense.gstRate / 100);
    
    await db.insert(financialTransactions).values({
      transactionDate: new Date().toISOString(),
      amount: expense.amount.toString(),
      transactionType: 'expense',
      paymentMethod: 'bank_transfer',
      description: `${expense.name}`,
      recordedBy: 1,
      gstEligible: true,
      hsn: expense.hsn,
      gstRate: expense.gstRate.toString(),
      gstAmount: gstAmount.toString()
    });
  }
  
  console.log('Created financial transactions');
}

async function verifyData() {
  const userCount = await db.select({ count: sql`count(*)` }).from(users);
  const fundCount = await db.select({ count: sql`count(*)` }).from(chitFunds);
  const paymentCount = await db.select({ count: sql`count(*)` }).from(payments);
  const transactionCount = await db.select({ count: sql`count(*)` }).from(financialTransactions);
  
  console.log('DATA VERIFICATION:');
  console.log(`- Users: ${userCount[0].count}`);
  console.log(`- Chit Funds: ${fundCount[0].count}`);
  console.log(`- Payments: ${paymentCount[0].count}`);
  console.log(`- Financial Transactions: ${transactionCount[0].count}`);
}

// Main function
async function generateSixMonthsData() {
  try {
    await clearData();
    const userIds = await createUsers();
    const funds = await createChitFunds();
    await addMembers(userIds, funds);
    await createPayments(funds);
    await createTransactions(userIds);
    await verifyData();
    console.log('COMPLETED: Six months test data generated successfully');
    return true;
  } catch (error) {
    console.error('ERROR generating test data:', error);
    return false;
  }
}

// Run the script
generateSixMonthsData()
  .then(success => {
    if (success) {
      console.log('✅ Test data generation complete!');
    } else {
      console.log('❌ Test data generation failed.');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });