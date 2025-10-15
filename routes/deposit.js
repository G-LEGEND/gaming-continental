const express = require("express");
const router = express.Router();
const Deposit = require("../models/Deposit");
const PaymentMethod = require("../models/PaymentMethod");
const User = require("../models/User");
const History = require("../models/History");

// ✅ Simple admin session check (NO TOKEN)
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Admin email required" });
  }
  
  // Check if admin is logged in (you'll need to share the loggedInAdmins between files)
  if (!req.app.get('loggedInAdmins')?.has(email)) {
    return res.status(403).json({ error: "Admin not logged in" });
  }
  
  next();
}

// ✅ Get all deposits - WITH ADMIN SESSION (No token)
router.post("/all", requireAdmin, async (req, res) => {
  try {
    console.log("📥 Fetching all deposits...");
    const deposits = await Deposit.find()
      .populate("userId", "email nickname")
      .populate("methodId", "bankName accountName accountNumber")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${deposits.length} deposits`);
    res.json(deposits);
  } catch (err) {
    console.error("❌ Error fetching deposits:", err);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

// ✅ Approve deposit - WITH ADMIN SESSION (No token)
router.put("/approve/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Approving deposit: ${req.params.id}`);
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ error: "Deposit not found" });
    if (deposit.status === "approved")
      return res.status(400).json({ error: "Deposit already approved" });

    deposit.status = "approved";
    await deposit.save();

    const user = await User.findById(deposit.userId);
    if (user) {
      user.balance += deposit.amount;
      await user.save();
      console.log(`✅ Added ${deposit.amount} to user ${user.nickname}`);
    }

    await History.findOneAndUpdate(
      { 
        transactionId: deposit._id.toString(),
        type: "deposit" 
      },
      {
        status: "completed",
        description: `Deposit approved - ${deposit.amount} added to balance`
      }
    );

    res.json({ message: "Deposit approved successfully ✅", deposit });
  } catch (err) {
    console.error("❌ Deposit approve error:", err);
    res.status(500).json({ error: "Failed to approve deposit" });
  }
});

// ✅ Reject deposit - WITH ADMIN SESSION (No token)  
router.put("/reject/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Rejecting deposit: ${req.params.id}`);
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ error: "Deposit not found" });
    if (deposit.status === "rejected")
      return res.status(400).json({ error: "Already rejected" });

    deposit.status = "rejected";
    await deposit.save();

    await History.findOneAndUpdate(
      { 
        transactionId: deposit._id.toString(),
        type: "deposit" 
      },
      {
        status: "rejected",
        description: `Deposit rejected - ${deposit.amount} not credited`
      }
    );

    res.json({ message: "Deposit rejected successfully ❌", deposit });
  } catch (err) {
    console.error("❌ Deposit reject error:", err);
    res.status(500).json({ error: "Failed to reject deposit" });
  }
});

// ✅ Create deposit - NO AUTH (Users can create deposits)
router.post("/create", async (req, res) => {
  try {
    const { userId, methodId, amount } = req.body;

    if (!userId || !methodId || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payment = await PaymentMethod.findById(methodId);
    if (!payment) {
      return res.status(404).json({ error: "Payment method not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const deposit = await Deposit.create({
      userId,
      methodId,
      amount,
      status: "pending",
      createdAt: new Date(),
    });

    await History.create({
      userId,
      type: "deposit",
      amount: amount,
      description: `Deposit request via ${payment.bankName}`,
      status: "pending",
      paymentMethod: payment.bankName,
      transactionId: deposit._id.toString()
    });

    res.json({ message: "Deposit created successfully", deposit });
  } catch (err) {
    console.error("❌ Deposit create error:", err);
    res.status(500).json({ error: "Failed to create deposit" });
  }
});

// ✅ Get user deposits - NO ADMIN AUTH (Users can see their own deposits)
router.get("/my-deposits", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const deposits = await Deposit.find({ userId })
      .populate("methodId", "bankName accountName accountNumber")
      .sort({ createdAt: -1 });

    res.json(deposits);
  } catch (err) {
    console.error("❌ Error fetching user deposits:", err);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

module.exports = router;