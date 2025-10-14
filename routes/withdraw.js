const express = require("express");
const router = express.Router();
const Withdraw = require("../models/Withdrawal");
const User = require("../models/User");
const History = require("../models/History"); // ✅ ADD HISTORY MODEL
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_change_this";

// ✅ Middleware: Verify user token (SAME AS DEPOSIT)
function verifyUser(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

// ✅ Middleware: Verify admin token (SAME AS DEPOSIT)
function verifyAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin)
      return res.status(403).json({ error: "Admin access required" });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

// ✅ Create withdrawal request (PROTECTED) - UPDATED WITH HISTORY
router.post("/", verifyUser, async (req, res) => {
  try {
    const { amount, method = "Bank Transfer" } = req.body;
    const userId = req.user.id;

    if (!amount || amount < 1000) {
      return res.status(400).json({ error: "Minimum withdrawal is ₦1000" });
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

// ✅ Get all withdrawals (Admin only)
router.get("/all", verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdraw.find()
      .populate("userId", "email nickname balance")
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// ✅ Get withdrawals for current user
router.get("/user/:id", verifyUser, async (req, res) => {
  try {
    // Ensure user can only access their own withdrawals
    if (req.user.id !== req.params.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const withdrawals = await Withdraw.find({ userId: req.params.id })
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    console.error("Fetch user withdrawals error:", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// ✅ Admin: Approve withdrawal - UPDATED WITH HISTORY
router.put("/approve/:id", verifyAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdraw.findById(req.params.id).populate("userId");
    
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
    withdrawal.processedBy = req.admin.id;
    await withdrawal.save();

    // ✅ UPDATE WITHDRAWAL HISTORY TO APPROVED
    await History.findOneAndUpdate(
      { 
        transactionId: withdrawal._id.toString(),
        type: "withdraw" 
      },
      {
        status: "completed",
        description: `Withdrawal approved - ${withdrawal.amount} sent to ${withdrawal.accountDetails.bankName}`
      }
    );

    res.json({ 
      message: "Withdrawal approved successfully ✅", 
      withdrawal 
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// ✅ Admin: Reject withdrawal - UPDATED WITH HISTORY
router.put("/reject/:id", verifyAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdraw.findById(req.params.id);
    
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Withdrawal already processed" });
    }

    withdrawal.status = "rejected";
    withdrawal.processedBy = req.admin.id;
    withdrawal.adminNote = req.body.note || "Request rejected";
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