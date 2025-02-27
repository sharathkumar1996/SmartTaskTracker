import { sql } from 'drizzle-orm';
import { db } from './server/db';
import { users, chitFunds, payments, fundMembers, financialTransactions } from './shared/schema';
import { hashPassword } from './server/auth';

// Telugu names for members (shortened list)
const teluguNames = [
  'Aadhya Reddy', 'Aanya Naidu', 'Abhinav Kumar', 'Aditya Rao', 'Akshay Varma',
  'Ananya Sharma', 'Anika Devi', 'Arjun Patel', 'Arnav Choudhury', 'Aryan Reddy',
  'Avani Mehta', 'Dhruv Nair', 'Diya Pillai', 'Esha Patel', 'Gaurav Singh',
  'Ishaan Rao', 'Isha Verma', 'Kavya Nair', 'Krish Sharma', 'Lakshmi Devi'
];

// Generate email based on name
const generateEmail = (name: string) => {
  const cleanName = name.toLowerCase().replace(/\s+/g, '.').replace(/[^\w.]/g, '');
  const provider = 'gmail.com';
  return `${cleanName}@${provider}`;
};

// Generate phone number
const generatePhone = () => {
  return `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
};

// Generate past date
const pastDate = (monthsAgo: number = 12) => {
  const today = new Date();
  const result = new Date(today);
  result.setMonth(result.getMonth() - monthsAgo);
  return result;
};

// Chit fund amounts (in rupees) - simplified list
const chitFundAmounts = [
  100000,  // 1 lakh
  200000,  // 2 lakhs
  500000,  // 5 lakhs
  1000000  // 10 lakhs
];

async function generateSimpleTestData() {
  try {
    console.log('Clearing existing data...');
    
    // Delete in proper order to respect foreign key constraints
    await db.execute(sql`DELETE FROM payments`);
    await db.execute(sql`DELETE FROM fund_members`);
    await db.execute(sql`DELETE FROM financial_transactions`);
    await db.execute(sql`DELETE FROM accounts_receivable`);
    await db.execute(sql`DELETE FROM accounts_payable`);
    await db.execute(sql`DELETE FROM notifications`);
    await db.execute(sql`DELETE FROM chit_funds`);
    await db.execute(sql`DELETE FROM group_members`);
    await db.execute(sql`DELETE FROM member_groups`);
    await db.execute(sql`DELETE FROM users WHERE username != 'admin'`); // Keep admin user
    
    console.log('All existing data cleared.');
    
    // 1. Create users with Telugu names
    console.log('Creating members with Telugu names...');
    const createdUserIds: number[] = [];
    
    for (let i = 0; i < teluguNames.length; i++) {
      const fullName = teluguNames[i];
      const username = `member${i + 1}`;
      const email = generateEmail(fullName);
      const phone = generatePhone();
      const hashedPassword = await hashPassword('password123');
      
      const role = i < 2 ? 'agent' : 'member'; // First 2 users are agents
      
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
    
    console.log(`Created ${createdUserIds.length} members`);
    
    // 2. Create chit funds
    console.log('Creating chit funds...');
    const createdChitFunds: any[] = [];
    
    for (let i = 0; i < chitFundAmounts.length; i++) {
      const amount = chitFundAmounts[i];
      const amountInLakhs = amount / 100000;
      const name = `${amountInLakhs} Lakh Fund ${i + 1}`;
      const startDate = pastDate(i + 6); // Staggered start dates
      const duration = 20; // All funds have 20 months duration
      const commissionRate = '5.0'; // 5% commission
      
      const result = await db.insert(chitFunds).values({
        name,
        amount: amount.toString(),
        duration,
        startDate: startDate.toISOString(),
        commissionRate,
        status: 'active'
      }).returning({ id: chitFunds.id });
      
      if (result && result.length > 0) {
        createdChitFunds.push({
          id: result[0].id,
          amount,
          duration,
          startDate,
          monthsPassed: Math.min(i + 6, duration)
        });
        console.log(`Created chit fund: ${name}`);
      }
    }
    
    console.log(`Created ${createdChitFunds.length} chit funds`);
    
    // 3. Add members to chit funds
    console.log('Adding members to chit funds...');
    
    for (const fund of createdChitFunds) {
      // Add 5 members to each fund
      for (let i = 0; i < 5; i++) {
        const userId = createdUserIds[i];
        
        await db.insert(fundMembers).values({
          userId,
          fundId: fund.id,
          isWithdrawn: false,
          earlyWithdrawalMonth: null
        });
        
        console.log(`Added user ${userId} to fund ${fund.id}`);
      }
    }
    
    console.log('Added members to all chit funds');
    
    // 4. Create payments
    console.log('Creating payments...');
    
    for (const fund of createdChitFunds) {
      const { id: fundId, monthsPassed, amount } = fund;
      
      // Get members for this fund
      const fundMembersList = await db.select().from(fundMembers).where(sql`fund_id = ${fundId}`);
      
      // Monthly payment amount
      const monthlyAmount = Math.round(amount / 20);
      
      // Create monthly payments for each member for first 3 months
      for (let month = 1; month <= Math.min(3, monthsPassed); month++) {
        // Calculate month date
        const monthDate = new Date(fund.startDate);
        monthDate.setMonth(monthDate.getMonth() + month - 1);
        
        // One member withdraws each month
        const withdrawalMember = fundMembersList[month - 1]; // First, second, third member
        
        if (withdrawalMember) {
          // Calculate commission
          const commissionAmount = Math.round(amount * 0.05); // 5% commission
          const withdrawalAmount = amount - commissionAmount;
          
          // Mark as withdrawn
          await db.update(fundMembers)
            .set({ 
              isWithdrawn: true,
              earlyWithdrawalMonth: month,
              totalCommissionPaid: commissionAmount.toString()
            })
            .where(sql`fund_id = ${fundId} AND user_id = ${withdrawalMember.userId}`);
          
          // Create withdrawal
          await db.insert(payments).values({
            userId: withdrawalMember.userId,
            chitFundId: fundId,
            amount: withdrawalAmount.toString(),
            paymentType: 'withdrawal',
            paymentDate: monthDate.toISOString(),
            paymentMethod: 'bank_transfer',
            monthNumber: month,
            commission: commissionAmount.toString(),
            notes: `Withdrawal for month ${month}`
          });
          
          console.log(`Created withdrawal payment for user ${withdrawalMember.userId}, month ${month}`);
        }
        
        // Create monthly payments for all non-withdrawn members
        for (const member of fundMembersList) {
          // Skip withdrawn members
          if (member.isWithdrawn && member.earlyWithdrawalMonth && member.earlyWithdrawalMonth <= month) {
            continue;
          }
          
          const paymentMethods = ['cash', 'bank_transfer', 'google_pay', 'phone_pay'];
          const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
          
          await db.insert(payments).values({
            userId: member.userId,
            chitFundId: fundId,
            amount: monthlyAmount.toString(),
            paymentType: 'monthly',
            paymentDate: monthDate.toISOString(),
            paymentMethod,
            monthNumber: month,
            notes: `Monthly payment for month ${month}`
          });
          
          console.log(`Created monthly payment for user ${member.userId}, month ${month}`);
        }
      }
    }
    
    console.log('Created payments for all funds');
    
    // 5. Create financial transactions
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
    
    // External loan
    await db.insert(financialTransactions).values({
      transactionDate: new Date().toISOString(),
      amount: '200000',
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
      amount: '50000',
      transactionType: 'loan_repayment',
      paymentMethod: 'bank_transfer',
      lenderName: 'HDFC Bank',
      description: 'Loan repayment',
      recordedBy: 1,
      gstEligible: false
    });
    
    // Agent salary
    for (let i = 0; i < 2; i++) { // For each agent (first 2 users)
      await db.insert(financialTransactions).values({
        transactionDate: new Date().toISOString(),
        amount: '20000',
        transactionType: 'agent_salary',
        paymentMethod: 'bank_transfer',
        agentId: createdUserIds[i],
        description: 'Monthly salary for agent',
        recordedBy: 1,
        gstEligible: false
      });
    }
    
    // Office expenses with GST
    const expenseTypes = [
      { name: 'Office Rent', hsn: '997212', gstRate: 18 },
      { name: 'Software Services', hsn: '998314', gstRate: 18 }
    ];
    
    for (const expenseType of expenseTypes) {
      const amount = 10000;
      const gstAmount = Math.round(amount * expenseType.gstRate / 100);
      
      await db.insert(financialTransactions).values({
        transactionDate: new Date().toISOString(),
        amount: amount.toString(),
        transactionType: 'expense',
        paymentMethod: 'bank_transfer',
        description: `${expenseType.name} expense`,
        recordedBy: 1,
        gstEligible: true,
        hsn: expenseType.hsn,
        gstRate: expenseType.gstRate.toString(),
        gstAmount: gstAmount.toString()
      });
    }
    
    console.log('Created financial transactions');
    console.log('Simple test data generation completed!');
    
    // Verify data
    const userCount = await db.select({ count: sql`count(*)` }).from(users);
    const fundCount = await db.select({ count: sql`count(*)` }).from(chitFunds);
    const paymentCount = await db.select({ count: sql`count(*)` }).from(payments);
    const transactionCount = await db.select({ count: sql`count(*)` }).from(financialTransactions);
    
    console.log('Verification:');
    console.log(`- Users: ${userCount[0].count}`);
    console.log(`- Chit Funds: ${fundCount[0].count}`);
    console.log(`- Payments: ${paymentCount[0].count}`);
    console.log(`- Financial Transactions: ${transactionCount[0].count}`);
    
  } catch (error) {
    console.error('Error generating test data:', error);
    throw error;
  }
}

// Execute the function
generateSimpleTestData()
  .then(() => {
    console.log('Database population completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database population failed:', error);
    process.exit(1);
  });