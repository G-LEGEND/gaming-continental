const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const Admin = require("../models/Admin");
const Deposit = require("../models/Deposit");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");

// ---------------- SIMPLE ADMIN SESSION CHECK (NO TOKENS) ----------------
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Admin email required" });
  }
  
  // Get loggedInAdmins from app context
  const loggedInAdmins = req.app.get('loggedInAdmins');
  if (!loggedInAdmins || !loggedInAdmins.has(email)) {
    return res.status(403).json({ error: "Admin not logged in" });
  }
  
  next();
}

// ---------------- ADMIN LOGIN (UPDATED) ----------------
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    // Store admin session
    const loggedInAdmins = req.app.get('loggedInAdmins');
    if (loggedInAdmins) {
      loggedInAdmins.set(email, Date.now());
    }

    res.json({ 
      message: "Admin login successful ✅", 
      admin: { email },
      loggedIn: true 
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ---------------- RANK SYSTEM (UPDATED - NO TOKENS) ----------------

// ✅ Fetch full rank list for admin dashboard (NO TOKEN)
router.post("/rank/all", requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("nickname email fifaPoints snookerPoints")
      .lean();

    const ranked = users
      .map((u) => ({
        ...u,
        totalPoints: (u.fifaPoints || 0) + (u.snookerPoints || 0),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    res.json(ranked);
  } catch (err) {
    console.error("Fetch rank error:", err);
    res.status(500).json({ error: "Failed to load rank" });
  }
});

// ✅ Add points (NO TOKEN)
router.post("/rank/add-points/:id", requireAdmin, async (req, res) => {
  try {
    const { category, points } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const numPoints = Number(points);
    if (!category || isNaN(numPoints) || numPoints <= 0) {
      return res
        .status(400)
        .json({ error: "Provide a valid category and positive points." });
    }

    if (category === "fifa") {
      user.fifaPoints = (user.fifaPoints || 0) + numPoints;
    } else if (category === "snooker") {
      user.snookerPoints = (user.snookerPoints || 0) + numPoints;
    } else {
      return res
        .status(400)
        .json({ error: "Invalid category. Must be 'fifa' or 'snooker'." });
    }

    await user.save();

    res.json({
      message: `✅ Added ${numPoints} ${category.toUpperCase()} points to ${user.nickname}`,
      user,
    });
  } catch (err) {
    console.error("Add points error:", err);
    res.status(500).json({ error: "Failed to add points" });
  }
});

// ✅ Public rank for all users (rank.html) - NO AUTH NEEDED
router.get("/public/rank", async (req, res) => {
  try {
    const users = await User.find()
      .select("nickname fifaPoints snookerPoints")
      .lean();

    const ranked = users
      .map((u) => ({
        ...u,
        totalPoints: (u.fifaPoints || 0) + (u.snookerPoints || 0),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    res.json(ranked);
  } catch (err) {
    console.error("Public rank load error:", err);
    res.status(500).json({ error: "Failed to load public rank" });
  }
});

// ---------------- WITHDRAWAL MANAGEMENT (UPDATED - NO TOKENS) ----------------

// ✅ Approve a withdrawal (NO TOKEN)
router.post("/withdrawals/approve/:id", requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    const user = await User.findById(withdrawal.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Deduct user balance only if status is still pending
    if (withdrawal.status === "pending") {
      if (user.balance < withdrawal.amount)
        return res.status(400).json({ error: "Insufficient balance" });

      user.balance -= withdrawal.amount;
      await user.save();
    }

    withdrawal.status = "approved";
    await withdrawal.save();

    res.json({ message: "✅ Withdrawal approved", withdrawal });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// ✅ Reject a withdrawal (NO TOKEN)
router.post("/withdrawals/reject/:id", requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    withdrawal.status = "rejected";
    await withdrawal.save();

    res.json({ message: "❌ Withdrawal rejected", withdrawal });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

module.exports = router;
module.exports.login = login;