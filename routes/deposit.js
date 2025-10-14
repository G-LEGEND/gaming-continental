const express = require("express");
const router = express.Router();
const Deposit = require("../models/Deposit");
const PaymentMethod = require("../models/PaymentMethod");
const User = require("../models/User");
const History = require("../models/History"); // ✅ ADD HISTORY MODEL
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_change_this";

// ✅ Middleware: Verify user token
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

// ✅ Middleware: Verify admin token
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

// ✅ Create a new deposit request (User)
router.post("/create", verifyUser, async (req, res) => {
  try {
    const { methodId, amount } = req.body;
    const userId = req.user.id;

    if (!methodId || !amount) {
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

    // ✅ RECORD DEPOSIT HISTORY
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
    console.error("Deposit create error:", err);
    res.status(500).json({ error: "Failed to create deposit" });
  }
});

// ✅ Get all deposits (Admin only)
router.get("/all", verifyAdmin, async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate("userId", "email nickname")
      .populate("methodId", "bankName accountName accountNumber")
      .sort({ createdAt: -1 });

    res.json(deposits);
  } catch (err) {
    console.error("Error fetching deposits:", err);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

// ✅ Approve deposit (Admin only) - UPDATED WITH HISTORY
router.put("/approve/:id", verifyAdmin, async (req, res) => {
  try {
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
    }

    // ✅ UPDATE DEPOSIT HISTORY TO APPROVED
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
    console.error("Deposit approve error:", err);
    res.status(500).json({ error: "Failed to approve deposit" });
  }
});

// ✅ Reject deposit (Admin only) - UPDATED WITH HISTORY
router.put("/reject/:id", verifyAdmin, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ error: "Deposit not found" });
    if (deposit.status === "rejected")
      return res.status(400).json({ error: "Already rejected" });

    deposit.status = "rejected";
    await deposit.save();

    // ✅ UPDATE DEPOSIT HISTORY TO REJECTED
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
    console.error("Deposit reject error:", err);
    res.status(500).json({ error: "Failed to reject deposit" });
  }
});

// ✅ Get user's deposit history (User only)
router.get("/my-deposits", verifyUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const deposits = await Deposit.find({ userId })
      .populate("methodId", "bankName accountName accountNumber")
      .sort({ createdAt: -1 });

    res.json(deposits);
  } catch (err) {
    console.error("Error fetching user deposits:", err);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

module.exports = router;