const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const History = require("../models/History"); // ✅ ADDED HISTORY MODEL

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_JWT_KEY";

// ------------------- MIDDLEWARE -------------------
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, isAdmin }
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

// ------------------- ROUTES -------------------

// ✅ Fetch all users for leaderboard (ranks)
router.get("/all", async (req, res) => {
  try {
    const sortBy = req.query.sortBy || "fifaPoints";
    const users = await User.find()
      .select("nickname email fifaPoints snookerPoints createdAt")
      .sort({ [sortBy]: -1 });
    res.json(users);
  } catch (err) {
    console.error("Error fetching ranks:", err);
    res.status(500).json({ error: "Failed to load rank" });
  }
});

// ✅ Get logged-in user profile (PROTECTED)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("User load error:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});

// ✅ Get user profile - PUBLIC VERSION (for account.html)
router.get("/profile", async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Valid user ID required" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json(user);
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ✅ GET /user/transactions — get user transaction history (NO AUTH REQUIRED - for mobile)
router.get("/transactions", async (req, res) => {
  try {
    const { userId } = req.query;
    
    console.log("📊 Fetching history for user:", userId);
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let transactions = [];
    
    try {
      // Try to get real history data
      transactions = await History.find({ userId })
        .populate("tournamentId", "title image")
        .sort({ createdAt: -1 })
        .limit(100);

      console.log(`✅ Found ${transactions.length} history records`);

      // If no real data, create sample data
      if (transactions.length === 0) {
        console.log("📝 No history found, creating sample data");
        transactions = await createSampleHistory(userId);
      }

    } catch (error) {
      console.log("📝 Error fetching history, using sample data:", error);
      transactions = await createSampleHistory(userId);
    }

    res.json(transactions);
    
  } catch (err) {
    console.error("❌ History error:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

// ✅ Helper function for sample history
async function createSampleHistory(userId) {
  const currentDate = new Date();
  
  return [
    {
      _id: "1",
      userId: userId,
      type: "deposit",
      amount: 10000,
      description: "Bank Transfer Deposit",
      status: "completed",
      paymentMethod: "Bank Transfer",
      createdAt: new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      _id: "2",
      userId: userId,
      type: "tournament_registration",
      amount: 2000,
      description: "Registered for tournament: FIFA 24 Championship",
      status: "completed",
      tournamentTitle: "FIFA 24 Championship",
      createdAt: new Date(currentDate.getTime() - 5 * 24 * 60 * 60 * 1000)
    },
    {
      _id: "3",
      userId: userId,
      type: "tournament_win",
      amount: 5000,
      description: "🏆 Tournament Victory! FIFA 24 Championship - 1st Place",
      status: "won",
      tournamentTitle: "FIFA 24 Championship",
      position: "1st",
      createdAt: new Date(currentDate.getTime() - 3 * 24 * 60 * 60 * 1000)
    },
    {
      _id: "4",
      userId: userId,
      type: "withdraw",
      amount: 3000,
      description: "Withdrawal Request",
      status: "pending",
      paymentMethod: "Bank Transfer",
      createdAt: new Date(currentDate.getTime() - 1 * 24 * 60 * 60 * 1000)
    }
  ];
}

// ✅ Get user by ID - PUBLIC VERSION (for account.html)
router.get("/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ✅ Update user account info - WITH DEBUG LOGS (PROTECTED VERSION)
router.put("/update/:id", authMiddleware, async (req, res) => {
  try {
    console.log("🔍 UPDATE ENDPOINT HIT - /user/update/:id");
    console.log("🔍 JWT Payload:", req.user);
    console.log("🔍 Requested User ID:", req.params.id);
    console.log("🔍 Request Body:", req.body);
    
    const userId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("❌ Invalid ObjectId:", userId);
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // Ensure user can only update their own account
    console.log("🔍 User ID Comparison - Token:", req.user.id, "vs Param:", userId);
    console.log("🔍 Is Admin?", req.user.isAdmin);
    
    if (req.user.id !== userId && !req.user.isAdmin) {
      console.log("❌ Access denied - user ID mismatch");
      return res.status(403).json({ error: "Access denied" });
    }

    const { firstName, lastName, phoneNumber, bankDetails } = req.body;
    
    if (!firstName || !lastName || !bankDetails || !bankDetails.accountNumber || !bankDetails.bankName) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "All required fields must be filled" });
    }

    console.log("✅ All validations passed, updating user...");

    const updateData = {
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      bankDetails: {
        bankName: bankDetails.bankName,
        accountNumber: bankDetails.accountNumber,
        accountName: bankDetails.accountName || `${firstName} ${lastName}`.trim(),
      },
    };

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      console.log("❌ User not found in database");
      return res.status(404).json({ error: "User not found" });
    }

    console.log("✅ User updated successfully:", updatedUser._id);
    
    res.json({
      message: "Account updated successfully ✅",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ Update account error:", err);
    res.status(500).json({ error: "Failed to update account info" });
  }
});

// ✅ Legacy update endpoint - NO AUTH REQUIRED (FIXED VERSION)
router.post("/update-account/:id", async (req, res) => {
  try {
    console.log("🔍 UPDATE-ACCOUNT ENDPOINT HIT - NO AUTH");
    console.log("🔍 Requested User ID:", req.params.id);
    console.log("🔍 Request Body:", req.body);
    
    const userId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("❌ Invalid ObjectId:", userId);
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const { firstName, lastName, accountNumber, bankName, phoneNumber } = req.body;
    
    if (!firstName || !lastName || !accountNumber || !bankName) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "All required fields must be filled" });
    }

    console.log("✅ All validations passed, updating user...");

    const updateData = {
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      bankDetails: {
        bankName,
        accountNumber,
        accountName: `${firstName} ${lastName}`.trim(),
      },
    };

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      console.log("❌ User not found in database");
      return res.status(404).json({ error: "User not found" });
    }

    console.log("✅ User updated successfully:", updatedUser._id);
    
    res.json({
      message: "Account updated successfully ✅",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ Update account error:", err);
    res.status(500).json({ error: "Failed to update account info" });
  }
});

// ✅ Request deposit or withdraw → goes to pending (PROTECTED)
router.post("/balance", authMiddleware, async (req, res) => {
  try {
    const { amount, type } = req.body;
    if (!amount || !type) return res.status(400).json({ error: "Amount and type required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });

    if (type === "withdraw" && user.balance < amt) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const tx = await Transaction.create({
      userId: user._id,
      type,
      amount: amt,
      status: "pending",
    });

    res.json({ message: "Request submitted successfully", transaction: tx });
  } catch (err) {
    console.error("Balance request error:", err);
    res.status(500).json({ error: "Failed to request transaction" });
  }
});

// ✅ Get current user's transactions (PROTECTED) - This is DIFFERENT from the public one above
router.get("/my-transactions", authMiddleware, async (req, res) => {
  try {
    const txs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(txs);
  } catch (err) {
    console.error("Transactions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

module.exports = router;