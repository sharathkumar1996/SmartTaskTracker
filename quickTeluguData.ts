import { sql } from 'drizzle-orm';
import { db } from './server/db';
import { users, chitFunds, payments, fundMembers, financialTransactions } from './shared/schema';
import { hashPassword } from './server/auth';

// Telugu names with surnames (25 total)
const TELUGU_NAMES = [
  'Ramarao Naidu', 'Satyanarayana Reddy', 'Venkata Rao', 'Suresh Babu', 'Krishna Murthy',
  'Lakshmi Devi', 'Padma Rani', 'Annapurna Devi', 'Sarada Devi', 'Vijaya Lakshmi',
  'Prasad Varma', 'Venkateswara Rao', 'Subrahmanyam Sharma', 'Ramakrishna Prasad', 'Gopala Krishna',
  'Srinivasa Rao', 'Bhaskar Reddy', 'Chandra Sekhar', 'Nageswara Rao', 'Hanumantha Rao',
  'Lakshmi Narayana', 'Koteswara Rao', 'Sivakumar Reddy', 'Narayana Swamy', 'Veera Raghava Rao'
];

// Create basic test data quickly
async function quickCreateTestData() {
  try {
    console.log('Clearing existing data...');
    // Keep admin user but delete everything else
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

    // 1. Create users (20 total: 4 agents, 16 members)
    console.log('Creating users...');
    const userIds = [];
    for (let i = 0; i < 20; i++) {
      const name = TELUGU_NAMES[i % TELUGU_NAMES.length];
      const role = i < 4 ? 'agent' : 'member';
      const username = `${role}${i+1}`;
      const phone = `+91${9000000001 + i}`;
      
      const result = await db.insert(users).values({
        username,
        password: await hashPassword('password123'),
        fullName: name,
        email: `${username.toLowerCase()}@example.com`,
        phone,
        role,
        status: 'active'
      }).returning({ id: users.id });
      
      if (result && result.length > 0) {
        userIds.push(result[0].id);
      }
    }
    console.log(`Created ${userIds.length} users`);

    // 2. Create 5 chit funds with different amounts
    console.log('Creating chit funds...');
    const fundAmounts = [100000, 200000, 500000, 1000000, 1500000]; // 1L, 2L, 5L, 10L, 15L
    const funds = [];
    
    for (let i = 0; i < fundAmounts.length; i++) {
      const amount = fundAmounts[i];
      const lakhs = amount / 100000;
      
      // Stagger start dates (6, 5, 4, 3, 2 months ago)
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (6 - i));
      startDate.setDate(15); // Middle of month
      
      const result = await db.insert(chitFunds).values({
        name: `${lakhs} Lakh Fund ${i+1}`,
        amount: amount.toString(),
        duration: 20,
        startDate: startDate.toISOString(),
        commissionRate: '5.0',
        status: 'active',
        baseCommission: Math.round(amount * 0.05).toString(), // 5% commission
        memberCount: 20
      }).returning({ id: chitFunds.id });
      
      if (result && result.length > 0) {
        funds.push({
          id: result[0].id,
          amount,
          startDate,
          name: `${lakhs} Lakh Fund ${i+1}`
        });
      }
    }
    console.log(`Created ${funds.length} chit funds`);

    // 3. Add members to funds and create payments
    console.log('Adding members and creating payments...');
    for (const fund of funds) {
      // Add users to this fund
      for (let i = 0; i < userIds.length && i < 10; i++) { // Max 10 members per fund
        const userId = userIds[i];
        await db.insert(fundMembers).values({
          userId,
          fundId: fund.id,
          isWithdrawn: false,
          earlyWithdrawalMonth: null
        });
        
        // Determine how many months of data to create for this fund
        const monthsSinceStart = Math.floor((new Date().getTime() - fund.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        const monthsToCreate = Math.min(monthsSinceStart, 6); // Max 6 months
        
        // Create monthly payments for this member
        for (let month = 1; month <= monthsToCreate; month++) {
          const paymentDate = new Date(fund.startDate);
          paymentDate.setMonth(paymentDate.getMonth() + month - 1);
          paymentDate.setDate(Math.floor(Math.random() * 10) + 5); // Random day between 5-15
          
          // 80% cash, 20% digital
          const paymentMethod = Math.random() > 0.2 ? 'cash' : 'bank_transfer';
          const monthlyAmount = Math.round(fund.amount / 20); // 1/20th of fund amount
          
          await db.insert(payments).values({
            userId,
            chitFundId: fund.id,
            amount: monthlyAmount.toString(),
            paymentType: 'monthly',
            paymentDate: paymentDate.toISOString(),
            paymentMethod,
            monthNumber: month,
            notes: `Monthly payment for month ${month}`
          });
        }
      }
      
      // Process one withdrawal for each fund
      if (fund.id > 0) {
        // Determine which month the withdrawal happened
        const withdrawalMonth = Math.min(3, Math.floor((new Date().getTime() - fund.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
        
        if (withdrawalMonth > 0) {
          // Pick first user as the one who withdrew
          const withdrawUserId = userIds[0];
          
          // Mark as withdrawn
          await db.update(fundMembers)
            .set({
              isWithdrawn: true,
              earlyWithdrawalMonth: withdrawalMonth,
              totalCommissionPaid: Math.round(fund.amount * 0.05).toString()
            })
            .where(sql\`fund_id = \${fund.id} AND user_id = \${withdrawUserId}\`);
          
          // Add withdrawal payment
          const withdrawalDate = new Date(fund.startDate);
          withdrawalDate.setMonth(withdrawalDate.getMonth() + withdrawalMonth - 1);
          withdrawalDate.setDate(20); // Typically later in the month
          
          const commissionAmount = Math.round(fund.amount * 0.05);
          const withdrawalAmount = fund.amount - commissionAmount;
          
          await db.insert(payments).values({
            userId: withdrawUserId,
            chitFundId: fund.id,
            amount: withdrawalAmount.toString(),
            paymentType: 'withdrawal',
            paymentDate: withdrawalDate.toISOString(),
            paymentMethod: 'bank_transfer',
            monthNumber: withdrawalMonth,
            commission: commissionAmount.toString(),
            notes: `Withdrawal for month ${withdrawalMonth}`
          });
        }
      }
    }

    // 4. Create financial transactions
    console.log('Creating financial transactions...');
    
    // Admin borrow
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    
    await db.insert(financialTransactions).values({
      amount: '50000',
      recordedBy: 1,
      transactionType: 'admin_borrow',
      paymentMethod: 'cash',
      description: 'Admin borrowed from fund',
      transactionDate: threeDaysAgo.toISOString(),
      gstEligible: false
    });
    
    // Admin repay
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    
    await db.insert(financialTransactions).values({
      amount: '20000',
      recordedBy: 1,
      transactionType: 'admin_repay',
      paymentMethod: 'bank_transfer',
      description: 'Admin repaid to fund',
      transactionDate: twoDaysAgo.toISOString(),
      gstEligible: false
    });
    
    // External loan
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(now.getMonth() - 1);
    
    await db.insert(financialTransactions).values({
      amount: '500000',
      recordedBy: 1,
      transactionType: 'external_loan',
      paymentMethod: 'bank_transfer',
      lenderName: 'HDFC Bank',
      interestRate: '24',
      description: 'External loan at 24% interest',
      transactionDate: oneMonthAgo.toISOString(),
      gstEligible: false
    });
    
    // Loan repayment
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(now.getDate() - 15);
    
    await db.insert(financialTransactions).values({
      amount: '100000',
      recordedBy: 1,
      transactionType: 'loan_repayment',
      paymentMethod: 'bank_transfer',
      lenderName: 'HDFC Bank',
      description: 'Loan repayment',
      transactionDate: fifteenDaysAgo.toISOString(),
      gstEligible: false
    });
    
    // GST eligible expense
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    
    await db.insert(financialTransactions).values({
      amount: '15000',
      recordedBy: 1,
      transactionType: 'expense',
      paymentMethod: 'bank_transfer',
      description: 'Office Rent',
      transactionDate: sevenDaysAgo.toISOString(),
      gstEligible: true,
      hsn: '997212',
      gstRate: '18',
      gstAmount: '2700'
    });
    
    // Agent salaries
    for (let i = 0; i < 3 && i < userIds.length; i++) {
      const aWeekAgo = new Date(now);
      aWeekAgo.setDate(now.getDate() - 7 - i);
      
      await db.insert(financialTransactions).values({
        amount: '15000',
        recordedBy: 1,
        transactionType: 'agent_salary',
        paymentMethod: 'bank_transfer',
        agentId: userIds[i],
        description: 'Monthly salary for agent',
        transactionDate: aWeekAgo.toISOString(),
        gstEligible: false
      });
    }

    // 5. Verify data counts
    const userCount = await db.select({ count: sql\`count(*)\` }).from(users);
    const fundCount = await db.select({ count: sql\`count(*)\` }).from(chitFunds);
    const paymentCount = await db.select({ count: sql\`count(*)\` }).from(payments);
    const transactionCount = await db.select({ count: sql\`count(*)\` }).from(financialTransactions);
    
    console.log('\nDATA SUMMARY:');
    console.log(\`- Users: \${parseInt(userCount[0].count.toString())}\`);
    console.log(\`- Chit Funds: \${parseInt(fundCount[0].count.toString())}\`);
    console.log(\`- Payments: \${parseInt(paymentCount[0].count.toString())}\`);
    console.log(\`- Financial Transactions: \${parseInt(transactionCount[0].count.toString())}\`);

    console.log('✅ Test data generation complete!');
    return true;
  } catch (error) {
    console.error('ERROR generating test data:', error);
    return false;
  }
}

// Run the script
quickCreateTestData()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });