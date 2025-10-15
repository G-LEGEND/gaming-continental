const express = require("express");
const router = express.Router();
const Withdraw = require("../models/Withdrawal");
const User = require("../models/User");
const History = require("../models/History");

// ✅ Simple admin session check (NO TOKEN)
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Admin email required" });
  }
  
  // Get loggedInAdmins from app context
  const loggedInAdmins = req.app.get('loggedInAdmins');
  console.log(`🔍 Checking admin session for: ${email}`);
  console.log(`📋 Logged in admins:`, loggedInAdmins ? Array.from(loggedInAdmins.keys()) : 'No loggedInAdmins');
  
  if (!loggedInAdmins || !loggedInAdmins.has(email)) {
    console.log(`❌ Admin ${email} not logged in`);
    return res.status(403).json({ error: "Admin not logged in" });
  }
  
  console.log(`✅ Admin ${email} is logged in`);
  next();
}

// ✅ Create withdrawal request (PROTECTED) - UPDATED WITH HISTORY
router.post("/", async (req, res) => {
  try {
    const { userId, amount, method = "Bank Transfer" } = req.body;

    if (!userId || !amount || amount < 1000) {
      return res.status(400).json({ error: "User ID and amount (min ₦1000) required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Check balance WITHOUT deducting yet
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Check if user has bank details
    if (!user.bankDetails || !user.bankDetails.accountNumber) {
      return res.status(400).json({ 
        error: "Please add your bank details in Account settings first" 
      });
    }

    // Create withdrawal record (DO NOT deduct balance yet)
    const withdraw = await Withdraw.create({
      userId: user._id,
      username: user.nickname,
      amount,
      method,
      accountDetails: user.bankDetails, // Store structured data
      status: "pending",
    });

    // ✅ RECORD WITHDRAWAL HISTORY
    await History.create({
      userId: user._id,
      type: "withdraw",
      amount: -amount, // Negative for withdrawal
      description: `Withdrawal request to ${user.bankDetails.bankName}`,
      status: "pending",
      paymentMethod: method,
      transactionId: withdraw._id.toString()
    });

    res.json({ 
      message: "Withdrawal request submitted successfully", 
      withdraw 
    });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// ✅ Get all withdrawals (Admin only) - SESSION BASED
router.post("/all", requireAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdraw.find()
      .populate("userId", "email nickname balance phoneNumber bankDetails")
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${withdrawals.length} withdrawals`);
    res.json(withdrawals);
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// ✅ Get withdrawals for current user
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "User ID required" });
    }

    const withdrawals = await Withdraw.find({ userId: id })
      .sort({ createdAt: -1 });
    
    res.json(withdrawals);
  } catch (err) {
    console.error("Fetch user withdrawals error:", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// ✅ Admin: Approve withdrawal - SESSION BASED
router.post("/approve/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 Approving withdrawal: ${id}`);
    
    const withdrawal = await Withdraw.findById(id).populate("userId");
    
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Withdrawal already processed" });
    }

    // Check if user still has sufficient balance
    if (withdrawal.userId.balance < withdrawal.amount) {
      return res.status(400).json({ error: "User has insufficient balance" });
    }

    // ✅ NOW deduct the balance (only when approved)
    await User.findByIdAndUpdate(withdrawal.userId._id, {
      $inc: { balance: -withdrawal.amount }
    });

    // Update withdrawal status
    withdrawal.status = "approved";
    await withdrawal.save();

    // ✅ UPDATE WITHDRAWAL HISTORY TO APPROVED
    await History.findOneAndUpdate(
      { 
        transactionId: withdrawal._id.toString(),
        type: "withdraw" 
      },
      {
        status: "completed",
        description: `Withdrawal approved - ${withdrawal.amount} sent to ${withdrawal.accountDetails?.bankName || 'bank'}`
      }
    );

    console.log(`✅ Withdrawal ${id} approved successfully`);
    res.json({ 
      message: "Withdrawal approved successfully ✅", 
      withdrawal 
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// ✅ Admin: Reject withdrawal - SESSION BASED
router.post("/reject/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    console.log(`📥 Rejecting withdrawal: ${id}`);
    
    const withdrawal = await Withdraw.findById(id);
    
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Withdrawal already processed" });
    }

    withdrawal.status = "rejected";
    withdrawal.adminNote = note || "Request rejected";
    await withdrawal.save();

    // ✅ UPDATE WITHDRAWAL HISTORY TO REJECTED
    await History.findOneAndUpdate(
      { 
        transactionId: withdrawal._id.toString(),
        type: "withdraw" 
      },
      {
        status: "rejected",
        description: `Withdrawal rejected - ${withdrawal.adminNote}`
      }
    );

    console.log(`✅ Withdrawal ${id} rejected successfully`);
    res.json({ 
      message: "Withdrawal rejected successfully ❌", 
      withdrawal 
    });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

module.exports = router;