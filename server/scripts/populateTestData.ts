import { sql } from 'drizzle-orm';
import { db } from '../db';
import { users, chitFunds, payments, fundMembers, financialTransactions, memberGroups, groupMembers } from '../../shared/schema';
import { hashPassword } from '../auth';
import { randomUUID } from 'crypto';

// First, clear all existing data
async function clearAllData() {
  console.log('Clearing existing data...');
  
  // Delete in proper order to respect foreign key constraints
  await db.execute(sql`DELETE FROM payments`);
  await db.execute(sql`DELETE FROM fund_members`);
  await db.execute(sql`DELETE FROM group_members`);
  await db.execute(sql`DELETE FROM member_groups`);
  await db.execute(sql`DELETE FROM financial_transactions`);
  await db.execute(sql`DELETE FROM accounts_receivable`);
  await db.execute(sql`DELETE FROM accounts_payable`);
  await db.execute(sql`DELETE FROM notifications`);
  await db.execute(sql`DELETE FROM chit_funds`);
  await db.execute(sql`DELETE FROM users WHERE username != 'admin'`); // Keep admin user
  
  console.log('All existing data cleared.');
}

// Telugu names for members
const teluguNames = [
  'Aadhya Reddy', 'Aanya Naidu', 'Abhinav Kumar', 'Aditya Rao', 'Akshay Varma',
  'Ananya Sharma', 'Anika Devi', 'Arjun Patel', 'Arnav Choudhury', 'Aryan Reddy',
  'Avani Mehta', 'Dhruv Nair', 'Diya Pillai', 'Esha Patel', 'Gaurav Singh',
  'Ishaan Rao', 'Isha Verma', 'Kavya Nair', 'Krish Sharma', 'Lakshmi Devi',
  'Madhav Rao', 'Meera Reddy', 'Mohit Kumar', 'Nandini Singh', 'Neha Choudhury',
  'Nishant Patel', 'Pooja Desai', 'Pranav Sharma', 'Priya Naidu', 'Rahul Mehta',
  'Riya Reddy', 'Rohan Varma', 'Saanvi Devi', 'Sai Kumar', 'Samarth Rao',
  'Sanvi Patel', 'Sanya Nair', 'Shivani Singh', 'Shreya Reddy', 'Tanvi Sharma',
  'Tara Naidu', 'Varun Mehta', 'Vedika Rao', 'Vihaan Patel', 'Yash Verma',
  'Aditi Reddy', 'Advait Rao', 'Anand Kumar', 'Anjali Devi', 'Aniket Sharma',
  'Ankita Nair', 'Aruna Reddy', 'Bhavya Patel', 'Chandra Varma', 'Deepak Singh',
  'Divya Naidu', 'Ganesh Rao', 'Geeta Devi', 'Gopal Verma', 'Harini Reddy',
  'Harish Kumar', 'Indira Patel', 'Jaya Devi', 'Karthik Naidu', 'Kavita Sharma',
  'Krishna Rao', 'Lalitha Reddy', 'Madhu Patel', 'Mallika Devi', 'Manoj Kumar',
  'Meenakshi Reddy', 'Mohan Naidu', 'Neeraj Sharma', 'Nikhil Varma', 'Nirmala Devi',
  'Padma Reddy', 'Prakash Rao', 'Preethi Nair', 'Radha Patel', 'Raj Kumar',
  'Rajesh Varma', 'Ramya Devi', 'Ravi Naidu', 'Rekha Reddy', 'Roopa Rao',
  'Sanjay Kumar', 'Santosh Patel', 'Savita Devi', 'Shankar Naidu', 'Shobha Reddy',
  'Siddharth Varma', 'Sneha Sharma', 'Srinivas Rao', 'Sudha Patel', 'Sudhir Kumar',
  'Suma Reddy', 'Sunil Naidu', 'Suresh Varma', 'Swati Devi', 'Uday Rao',
  'Uma Reddy', 'Venkat Kumar', 'Vijay Naidu', 'Vimala Devi', 'Vinay Sharma',
  'Vishal Patel', 'Yamini Reddy', 'Aditya Varma', 'Bhanu Prasad', 'Chandini Devi',
  'Deepika Reddy', 'Girish Kumar', 'Harsha Vardhan', 'Jyothi Lakshmi', 'Kiran Rao',
  'Lavanya Devi', 'Mahesh Babu', 'Naga Chaitanya', 'Pavan Kumar', 'Rajendra Prasad',
  'Sai Krishna', 'Surya Prakash', 'Tarun Kumar', 'Usha Rani', 'Venu Gopal',
  'Anand Naidu', 'Balakrishna Rao', 'Durga Prasad', 'Eswar Reddy', 'Gopala Krishna',
  'Hari Prasad', 'Jagadish Rao', 'Kamala Devi', 'Lakshmi Narayana', 'Madhavi Latha',
  'Narayana Rao', 'Padmavathi Devi', 'Ramachandra Rao', 'Saraswathi Devi', 'Satyanarayana',
  'Subramanyam', 'Suryanarayana', 'Vasundhara Devi', 'Vijaya Lakshmi', 'Ramakrishna'
];

// Telugu cities
const teluguCities = [
  'Hyderabad', 'Vijayawada', 'Visakhapatnam', 'Guntur', 'Nellore', 
  'Kurnool', 'Rajahmundry', 'Tirupati', 'Kakinada', 'Warangal',
  'Eluru', 'Anantapur', 'Kadapa', 'Nizamabad', 'Khammam',
  'Karimnagar', 'Ramagundam', 'Nandyal', 'Adoni', 'Mahbubnagar'
];

// Phone number generator
const generatePhone = () => {
  return `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
};

// Email generator based on name
const generateEmail = (name: string) => {
  const cleanName = name.toLowerCase().replace(/\s+/g, '.').replace(/[^\w.]/g, '');
  const providers = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'rediffmail.com'];
  const provider = providers[Math.floor(Math.random() * providers.length)];
  return `${cleanName}@${provider}`;
};

// Generate random date within a range
const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Generate a past date within the last 3 years
const pastDate = (maxMonthsAgo: number = 36) => {
  const today = new Date();
  const monthsAgo = Math.floor(Math.random() * maxMonthsAgo);
  const result = new Date(today);
  result.setMonth(result.getMonth() - monthsAgo);
  return result;
};

// Generate chit fund name
const generateChitFundName = (amount: number, index: number) => {
  const amountInLakhs = amount / 100000;
  const names = [
    `${amountInLakhs} Lakh Premium Fund ${index}`,
    `${amountInLakhs} Lakh Special Scheme ${index}`,
    `Sri Vasavi ${amountInLakhs}L Fund ${index}`,
    `${amountInLakhs} Lakh Prosperity Chit ${index}`,
    `Golden ${amountInLakhs} Lakh Fund ${index}`
  ];
  return names[Math.floor(Math.random() * names.length)];
};

// Chit fund amounts (in rupees)
const chitFundAmounts = [
  100000,  // 1 lakh
  100000,  // 1 lakh (second one)
  200000,  // 2 lakhs
  300000,  // 3 lakhs
  500000,  // 5 lakhs
  500000,  // 5 lakhs (second one)
  750000,  // 7.5 lakhs
  1000000, // 10 lakhs
  1200000, // 12 lakhs
  1500000  // 15 lakhs
];

// Populate database with test data
async function populateTestData() {
  try {
    await clearAllData();
    
    // Create admin user (if it doesn't exist)
    const existingAdmin = await db.select().from(users).where(sql`username = 'admin'`);
    if (existingAdmin.length === 0) {
      const hashedPassword = await hashPassword('admin123');
      await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        fullName: 'Admin User',
        email: 'admin@srivasavichitfunds.com',
        phone: '+919876543210',
        role: 'admin',
        status: 'active'
      });
      console.log('Admin user created');
    }
    
    // 1. Create 150 members with Telugu names
    console.log('Creating 150 members...');
    const createdUserIds: number[] = [];
    
    for (let i = 0; i < 150; i++) {
      const fullName = teluguNames[i % teluguNames.length];
      const username = `member${i + 1}`;
      const email = generateEmail(fullName);
      const phone = generatePhone();
      const city = teluguCities[Math.floor(Math.random() * teluguCities.length)];
      const hashedPassword = await hashPassword('password123');
      
      const role = i < 5 ? 'agent' : 'member'; // First 5 users are agents
      
      const result = await db.insert(users).values({
        username,
        password: hashedPassword,
        fullName,
        email,
        phone,
        city,
        role,
        status: 'active',
        agentCommission: role === 'agent' ? '2.5' : null // 2.5% commission for agents
      }).returning({ id: users.id });
      
      if (result && result.length > 0) {
        createdUserIds.push(result[0].id);
      }
    }
    
    console.log(`Created ${createdUserIds.length} members`);
    
    // 2. Create 10 chit funds ranging from 1 lakh to 15 lakhs
    console.log('Creating 10 chit funds...');
    const createdChitFunds: any[] = [];
    
    for (let i = 0; i < chitFundAmounts.length; i++) {
      const amount = chitFundAmounts[i];
      const name = generateChitFundName(amount, i + 1);
      const startDate = pastDate(36); // Within last 3 years
      
      // Calculate duration and status
      const duration = 20 + Math.floor(Math.random() * 10); // 20-30 months
      const monthsPassed = Math.floor((new Date().getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
      const status = monthsPassed >= duration ? 'completed' : 'active';
      
      const commissionRate = '5.0'; // 5% commission
      
      const result = await db.insert(chitFunds).values({
        name,
        amount: amount.toString(),
        duration,
        startDate: startDate.toISOString(),
        commissionRate,
        status
      }).returning({ id: chitFunds.id });
      
      if (result && result.length > 0) {
        createdChitFunds.push({
          id: result[0].id,
          amount,
          duration,
          startDate,
          status,
          monthsPassed: Math.min(monthsPassed, duration)
        });
      }
    }
    
    console.log(`Created ${createdChitFunds.length} chit funds`);
    
    // 3. Create member groups (10 groups with 3-5 members each)
    console.log('Creating member groups...');
    const createdGroupIds: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const name = `Group ${i + 1}`;
      const primaryUserId = createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
      
      const result = await db.insert(memberGroups).values({
        name,
        createdBy: 1, // Admin created
        primaryUserId,
        isActive: true,
        notes: `Group for collective chit fund participation ${i + 1}`
      }).returning({ id: memberGroups.id });
      
      if (result && result.length > 0) {
        createdGroupIds.push(result[0].id);
      }
    }
    
    // Add members to groups
    for (const groupId of createdGroupIds) {
      const memberCount = 3 + Math.floor(Math.random() * 3); // 3-5 members per group
      const groupMembers = new Set<number>();
      
      while (groupMembers.size < memberCount) {
        const randomUserId = createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
        groupMembers.add(randomUserId);
      }
      
      for (const userId of groupMembers) {
        // Calculate share percentage (total should be 100%)
        const sharePercentage = (100 / memberCount).toFixed(2);
        
        await db.insert(groupMembers).values({
          userId,
          groupId,
          sharePercentage,
          notes: `Member of group ${groupId}`
        });
      }
    }
    
    console.log(`Created ${createdGroupIds.length} groups with members`);
    
    // 4. Add members to chit funds
    console.log('Adding members to chit funds...');
    
    for (const fund of createdChitFunds) {
      const memberCount = 20; // Fixed 20 members per chit fund
      const fundMembers = new Set<number>();
      
      // Add some regular members
      while (fundMembers.size < (memberCount - 3)) { // Reserve spots for groups and agents
        const randomUserId = createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
        fundMembers.add(randomUserId);
      }
      
      // Add fund members
      for (const userId of fundMembers) {
        await db.insert(fundMembers).values({
          userId,
          fundId: fund.id,
          isWithdrawn: false,
          earlyWithdrawalMonth: null,
          increasedMonthlyAmount: null,
          totalBonusReceived: null,
          totalCommissionPaid: null
        });
      }
      
      // Add 1-2 groups as members
      const groupCount = 1 + Math.floor(Math.random() * 2); // 1-2 groups
      const selectedGroups = new Set<number>();
      
      while (selectedGroups.size < groupCount && selectedGroups.size < createdGroupIds.length) {
        const randomGroupId = createdGroupIds[Math.floor(Math.random() * createdGroupIds.length)];
        selectedGroups.add(randomGroupId);
      }
      
      for (const groupId of selectedGroups) {
        const groupData = await db.select().from(memberGroups).where(sql`id = ${groupId}`);
        if (groupData.length > 0 && groupData[0].primaryUserId) {
          await db.insert(fundMembers).values({
            userId: groupData[0].primaryUserId,
            fundId: fund.id,
            isWithdrawn: false,
            earlyWithdrawalMonth: null,
            increasedMonthlyAmount: null,
            totalBonusReceived: null,
            totalCommissionPaid: null,
            metadata: JSON.stringify({ isGroup: true, groupId })
          });
        }
      }
      
      // Add at least one agent to each fund
      for (let i = 0; i < Math.min(2, 5); i++) { // Add up to 2 agents from the first 5 users (who are agents)
        if (!fundMembers.has(createdUserIds[i])) {
          await db.insert(fundMembers).values({
            userId: createdUserIds[i],
            fundId: fund.id,
            isWithdrawn: false,
            earlyWithdrawalMonth: null,
            increasedMonthlyAmount: null,
            totalBonusReceived: null,
            totalCommissionPaid: null
          });
          break; // Add just one agent
        }
      }
    }
    
    console.log('Added members to all chit funds');
    
    // 5. Create payments history for each fund
    console.log('Creating payment history...');
    
    for (const fund of createdChitFunds) {
      const { id: fundId, monthsPassed, amount, startDate } = fund;
      
      // Get all members for this fund
      const fundMembersList = await db.select().from(fundMembers).where(sql`fund_id = ${fundId}`);
      
      // For each past month, create payments and withdrawals
      for (let month = 1; month <= monthsPassed; month++) {
        // Calculate month date
        const monthDate = new Date(startDate);
        monthDate.setMonth(monthDate.getMonth() + month - 1);
        
        // Calculate monthly payment amount
        const monthlyAmount = Math.round(amount / 20); // Simple calculation - fund divided by number of members
        
        // Each month one member withdraws
        const withdrawalIndex = month % fundMembersList.length;
        const withdrawalMember = fundMembersList[withdrawalIndex];
        
        if (withdrawalMember) {
          // The withdrawal member gets the fund amount minus commission
          const commissionAmount = Math.round(amount * 0.05); // 5% commission
          const withdrawalAmount = amount - commissionAmount;
          
          // Mark the member as withdrawn
          await db.update(fundMembers)
            .set({ 
              isWithdrawn: true,
              earlyWithdrawalMonth: month,
              totalCommissionPaid: commissionAmount.toString()
            })
            .where(sql`fund_id = ${fundId} AND user_id = ${withdrawalMember.userId}`);
          
          // Create withdrawal payment
          const withdrawalDate = new Date(monthDate);
          withdrawalDate.setDate(10 + Math.floor(Math.random() * 10)); // Withdrawal between 10th-20th
          
          await db.insert(payments).values({
            userId: withdrawalMember.userId,
            chitFundId: fundId,
            amount: withdrawalAmount.toString(),
            paymentType: 'withdrawal',
            paymentDate: withdrawalDate.toISOString(),
            paymentMethod: Math.random() > 0.5 ? 'bank_transfer' : 'cheque',
            monthNumber: month,
            commission: commissionAmount.toString(),
            notes: `Chit fund withdrawal for month ${month}`
          });
          
          // Sometimes we need to borrow money for additional withdrawals
          if (Math.random() > 0.7) { // 30% chance of extra withdrawal with external loan
            // Create a financial transaction for external loan
            const loanAmount = amount;
            const loanDate = new Date(withdrawalDate);
            loanDate.setDate(loanDate.getDate() - 5); // Loan taken 5 days before withdrawal
            
            await db.insert(financialTransactions).values({
              transactionDate: loanDate.toISOString(),
              amount: loanAmount.toString(),
              transactionType: 'external_loan',
              paymentMethod: 'bank_transfer',
              lenderName: ['HDFC Bank', 'Axis Bank', 'ICICI Bank', 'SBI', 'Local Finance'][Math.floor(Math.random() * 5)],
              interestRate: '24',
              description: `External loan for additional withdrawal in month ${month}`,
              recordedBy: 1, // Admin recorded
              gstEligible: false
            });
            
            // Create another withdrawal payment for a different member
            const extraWithdrawalIndex = (withdrawalIndex + 1) % fundMembersList.length;
            const extraWithdrawalMember = fundMembersList[extraWithdrawalIndex];
            
            if (extraWithdrawalMember) {
              // Mark this member as withdrawn too
              await db.update(fundMembers)
                .set({ 
                  isWithdrawn: true,
                  earlyWithdrawalMonth: month,
                  totalCommissionPaid: commissionAmount.toString()
                })
                .where(sql`fund_id = ${fundId} AND user_id = ${extraWithdrawalMember.userId}`);
              
              // Create withdrawal payment
              const extraWithdrawalDate = new Date(withdrawalDate);
              extraWithdrawalDate.setDate(extraWithdrawalDate.getDate() + 1);
              
              await db.insert(payments).values({
                userId: extraWithdrawalMember.userId,
                chitFundId: fundId,
                amount: withdrawalAmount.toString(),
                paymentType: 'withdrawal',
                paymentDate: extraWithdrawalDate.toISOString(),
                paymentMethod: Math.random() > 0.5 ? 'bank_transfer' : 'cheque',
                monthNumber: month,
                commission: commissionAmount.toString(),
                notes: `Extra chit fund withdrawal for month ${month} (funded by external loan)`
              });
            }
          }
        }
        
        // Create monthly payments for all non-withdrawn members
        for (const member of fundMembersList) {
          // Skip if this member already withdrew
          if (member.isWithdrawn && member.earlyWithdrawalMonth && member.earlyWithdrawalMonth <= month) {
            continue;
          }
          
          // 90% chance of payment being made, 10% chance of missing payment for realism
          if (Math.random() > 0.1) {
            const paymentDate = new Date(monthDate);
            paymentDate.setDate(1 + Math.floor(Math.random() * 10)); // Payment between 1st-10th
            
            const paymentMethods = ['cash', 'bank_transfer', 'google_pay', 'phone_pay'];
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            
            await db.insert(payments).values({
              userId: member.userId,
              chitFundId: fundId,
              amount: monthlyAmount.toString(),
              paymentType: 'monthly',
              paymentDate: paymentDate.toISOString(),
              paymentMethod,
              monthNumber: month,
              notes: `Monthly payment for month ${month}`
            });
          }
        }
      }
    }
    
    console.log('Created payment history for all funds');
    
    // 6. Create financial transactions (admin expenses, agent salaries, GST payments, etc.)
    console.log('Creating financial transactions...');
    
    // Start date for transactions - 3 years ago
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    
    // Generate admin borrow transactions
    for (let i = 0; i < 25; i++) {
      const transactionDate = randomDate(threeYearsAgo, new Date());
      const amount = 5000 + Math.floor(Math.random() * 95000);
      
      await db.insert(financialTransactions).values({
        transactionDate: transactionDate.toISOString(),
        amount: amount.toString(),
        transactionType: 'admin_borrow',
        paymentMethod: 'cash',
        description: `Admin borrowed from chit fund`,
        recordedBy: 1,
        gstEligible: false
      });
    }
    
    // Generate admin repay transactions
    for (let i = 0; i < 20; i++) {
      const transactionDate = randomDate(threeYearsAgo, new Date());
      const amount = 5000 + Math.floor(Math.random() * 50000);
      
      await db.insert(financialTransactions).values({
        transactionDate: transactionDate.toISOString(),
        amount: amount.toString(),
        transactionType: 'admin_repay',
        paymentMethod: 'bank_transfer',
        description: `Admin repaid to chit fund`,
        recordedBy: 1,
        gstEligible: false
      });
    }
    
    // Generate external loans
    for (let i = 0; i < 15; i++) {
      const transactionDate = randomDate(threeYearsAgo, new Date());
      const amount = 100000 + Math.floor(Math.random() * 900000);
      
      await db.insert(financialTransactions).values({
        transactionDate: transactionDate.toISOString(),
        amount: amount.toString(),
        transactionType: 'external_loan',
        paymentMethod: 'bank_transfer',
        lenderName: ['HDFC Bank', 'Axis Bank', 'ICICI Bank', 'SBI', 'Local Finance'][Math.floor(Math.random() * 5)],
        interestRate: (12 + Math.floor(Math.random() * 12)).toString(), // 12-24%
        description: `External loan for business operations`,
        recordedBy: 1,
        gstEligible: false
      });
    }
    
    // Generate loan repayments
    for (let i = 0; i < 30; i++) {
      const transactionDate = randomDate(threeYearsAgo, new Date());
      const amount = 10000 + Math.floor(Math.random() * 90000);
      
      await db.insert(financialTransactions).values({
        transactionDate: transactionDate.toISOString(),
        amount: amount.toString(),
        transactionType: 'loan_repayment',
        paymentMethod: 'bank_transfer',
        lenderName: ['HDFC Bank', 'Axis Bank', 'ICICI Bank', 'SBI', 'Local Finance'][Math.floor(Math.random() * 5)],
        description: `Loan repayment`,
        recordedBy: 1,
        gstEligible: false
      });
    }
    
    // Generate agent salary payments
    for (let i = 0; i < 5; i++) { // For each agent
      for (let month = 0; month < 36; month++) { // For the past 36 months
        const transactionDate = new Date(threeYearsAgo);
        transactionDate.setMonth(transactionDate.getMonth() + month);
        
        const amount = 15000 + Math.floor(Math.random() * 10000); // 15k-25k salary
        
        await db.insert(financialTransactions).values({
          transactionDate: transactionDate.toISOString(),
          amount: amount.toString(),
          transactionType: 'agent_salary',
          paymentMethod: 'bank_transfer',
          agentId: createdUserIds[i], // First 5 users are agents
          description: `Monthly salary for agent`,
          recordedBy: 1,
          gstEligible: false
        });
      }
    }
    
    // Generate expense transactions
    const expenseTypes = [
      { name: 'Office Rent', hsn: '997212', gstRate: 18 },
      { name: 'Software Services', hsn: '998314', gstRate: 18 },
      { name: 'Computer Equipment', hsn: '847130', gstRate: 18 },
      { name: 'Internet Services', hsn: '998411', gstRate: 18 },
      { name: 'Stationery', hsn: '4820', gstRate: 12 },
      { name: 'Professional Services', hsn: '9982', gstRate: 18 },
      { name: 'Electricity', hsn: '996312', gstRate: 18 },
      { name: 'Office Supplies', hsn: '4823', gstRate: 12 },
      { name: 'Vehicle Maintenance', hsn: '998714', gstRate: 18 },
      { name: 'Travel Expenses', hsn: '996411', gstRate: 5 }
    ];
    
    // Generate office expenses - one for each month for the past 3 years
    for (let month = 0; month < 36; month++) {
      const transactionDate = new Date(threeYearsAgo);
      transactionDate.setMonth(transactionDate.getMonth() + month);
      
      // Generate 3-5 expenses for each month
      const expenseCount = 3 + Math.floor(Math.random() * 3);
      
      for (let j = 0; j < expenseCount; j++) {
        const expenseType = expenseTypes[Math.floor(Math.random() * expenseTypes.length)];
        const amount = 1000 + Math.floor(Math.random() * 19000); // 1k-20k expenses
        
        // Calculate GST
        const gstEligible = Math.random() > 0.2; // 80% of expenses are GST eligible
        const gstRate = expenseType.gstRate;
        const gstAmount = gstEligible ? Math.round(amount * gstRate / 100) : 0;
        
        await db.insert(financialTransactions).values({
          transactionDate: transactionDate.toISOString(),
          amount: amount.toString(),
          transactionType: 'expense',
          paymentMethod: Math.random() > 0.5 ? 'bank_transfer' : 'cash',
          description: `${expenseType.name} expense`,
          recordedBy: 1,
          gstEligible,
          hsn: expenseType.hsn,
          gstRate: gstRate.toString(),
          gstAmount: gstAmount.toString()
        });
      }
    }
    
    console.log('Created financial transactions');
    console.log('Test data population completed successfully!');
  } catch (error) {
    console.error('Error populating test data:', error);
    throw error;
  }
}

// Execute the function
populateTestData()
  .then(() => {
    console.log('Database population completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database population failed:', error);
    process.exit(1);
  });