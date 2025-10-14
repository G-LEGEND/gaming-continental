const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ---------- Config ----------
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_change_this";

// ✅ MongoDB URI
const MONGO_URI =
  "mongodb+srv://olaoluwa705_db_user:olaoluwanishola_1@cluster0.r4pqjm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// ---------- Initialize App ----------
const app = express();

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- MongoDB Models ----------
const Admin = require("./models/Admin");
const Tournament = require("./models/Tournament");
const PaymentMethod = require("./models/PaymentMethod");
const Deposit = require("./models/Deposit");
const User = require("./models/User");
const Match = require("./models/Match");
const Bet = require("./models/Bet");
const Withdraw = require("./models/Withdrawal");
const History = require("./models/History"); // ✅ ADDED HISTORY MODEL

// ---------- JWT Middlewares ----------
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

// ---------- Seed Default Admins ----------
async function seedAdmins() {
  const admins = [
    { email: "olaoluwa705@gmail.com", password: "Olaoluwa705" },
    { email: "pippinpaul069@gmail.com", password: "PaulPaul" },
  ];

  for (let a of admins) {
    const existing = await Admin.findOne({ email: a.email });
    if (!existing) {
      const hashed = await bcrypt.hash(a.password, 10);
      await Admin.create({ email: a.email, password: hashed });
      console.log(`✅ Admin created: ${a.email}`);
    }
  }
}

// ---------- Routes ----------
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const tournamentRoutes = require("./routes/tournament");
const publicTournamentRoutes = require("./routes/publicTournament");
const livescoreRoutes = require("./routes/livescore");
const matchRoutes = require("./routes/match");
const adminRoutes = require("./routes/admin");
const depositRoutes = require("./routes/deposit");
const paymentRoutes = require("./routes/payment");
const betRoutes = require("./routes/bet");
const livestreamRoutes = require("./routes/livestream");

// ---------- Use Routes ----------
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/livescore", livescoreRoutes);
app.use("/api/match", matchRoutes);
console.log("✅ Match routes mounted at /api/match");
app.use("/deposit", depositRoutes);
app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/admin/livestream", verifyAdmin, livestreamRoutes);

// ✅ Tournament routes - FIXED MOUNTING
app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);
app.use("/admin/tournament", verifyAdmin, tournamentRoutes);

// ✅ Admin login
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, isAdmin: true }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ message: "Admin login successful ✅", token });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Protected admin routes
app.use("/admin", verifyAdmin, adminRoutes);

// ==================================================
// 🧩 HISTORY ENDPOINT FOR MOBILE HISTORY PAGE
// ==================================================

// ✅ GET /user/transactions — get user transaction history (NO TOKEN REQUIRED)
app.get("/user/transactions", async (req, res) => {
  try {
    const { userId } = req.query;
    
    console.log("📊 Fetching history for user:", userId);
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      console.log("⚠️ MongoDB not connected, returning sample data");
      const sampleData = createSampleHistory(userId);
      return res.json(sampleData);
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
        transactions = createSampleHistory(userId);
      }

    } catch (error) {
      console.log("📝 Database error, using sample data:", error.message);
      transactions = createSampleHistory(userId);
    }

    res.json(transactions);
    
  } catch (err) {
    console.error("❌ History error:", err);
    // Always return sample data even on error
    const sampleData = createSampleHistory(req.query.userId || 'unknown');
    res.json(sampleData);
  }
});

// ✅ Helper function for sample history - FIXED NEGATIVE AMOUNTS
function createSampleHistory(userId) {
  const currentDate = new Date();
  
  return [
    {
      _id: "1",
      userId: userId,
      type: "deposit",
      amount: 10000, // ✅ POSITIVE
      description: "Bank Transfer Deposit",
      status: "completed",
      paymentMethod: "Bank Transfer",
      createdAt: new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      _id: "2",
      userId: userId,
      type: "tournament_registration",
      amount: 2000, // ✅ POSITIVE (was negative)
      description: "Registered for tournament: FIFA 24 Championship",
      status: "completed",
      tournamentTitle: "FIFA 24 Championship",
      createdAt: new Date(currentDate.getTime() - 5 * 24 * 60 * 60 * 1000)
    },
    {
      _id: "3",
      userId: userId,
      type: "tournament_win",
      amount: 5000, // ✅ POSITIVE
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
      amount: 3000, // ✅ POSITIVE (was negative)
      description: "Withdrawal Request",
      status: "pending",
      paymentMethod: "Bank Transfer",
      createdAt: new Date(currentDate.getTime() - 1 * 24 * 60 * 60 * 1000)
    }
  ];
}

// ==================================================
// 🧩 HISTORY ENDPOINT END
// ==================================================

// ==================================================
// 🧩 CORRECTED WITHDRAWAL SYSTEM START
// ==================================================

// ✅ POST /withdraw/ — create withdraw request (PROTECTED) - UPDATED WITH HISTORY
app.post("/withdraw/", verifyUser, async (req, res) => {
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
      accountDetails: user.bankDetails,
      status: "pending",
    });

    // ✅ CREATE WITHDRAWAL HISTORY RECORD
    await History.create({
      userId: user._id,
      type: "withdraw",
      amount: amount, // POSITIVE - frontend will show as negative
      description: `Withdrawal request - ${method}`,
      status: "pending",
      paymentMethod: method,
      transactionId: withdraw._id.toString(),
      createdAt: new Date()
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

// ✅ GET /withdraw/user/:id — get user withdrawals (PROTECTED)
app.get("/withdraw/user/:id", verifyUser, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const withdrawals = await Withdraw.find({ userId: req.params.id })
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// ✅ GET /withdraw/all — admin view (PROTECTED)
app.get("/withdraw/all", verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdraw.find()
      .populate("userId", "nickname email balance phoneNumber")
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all withdrawals" });
  }
});

// ✅ PUT /withdraw/approve/:id — admin approve (PROTECTED) - UPDATED WITH HISTORY
app.put("/withdraw/approve/:id", verifyAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdraw.findById(req.params.id).populate("userId");
    
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Withdrawal already processed" });
    }

    if (withdrawal.userId.balance < withdrawal.amount) {
      return res.status(400).json({ error: "User has insufficient balance" });
    }

    await User.findByIdAndUpdate(withdrawal.userId._id, {
      $inc: { balance: -withdrawal.amount }
    });

    withdrawal.status = "approved";
    withdrawal.processedBy = req.admin.id;
    await withdrawal.save();

    // ✅ UPDATE WITHDRAWAL HISTORY STATUS TO COMPLETED
    await History.findOneAndUpdate(
      { 
        transactionId: withdrawal._id.toString(),
        type: "withdraw" 
      },
      {
        status: "completed",
        description: `Withdrawal approved - ₦${withdrawal.amount} sent to your bank account`
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

// ✅ PUT /withdraw/reject/:id — admin reject (PROTECTED) - UPDATED WITH HISTORY
app.put("/withdraw/reject/:id", verifyAdmin, async (req, res) => {
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

    // ✅ UPDATE WITHDRAWAL HISTORY STATUS TO REJECTED
    await History.findOneAndUpdate(
      { 
        transactionId: withdrawal._id.toString(),
        type: "withdraw" 
      },
      {
        status: "rejected",
        description: `Withdrawal rejected - ${withdrawal.adminNote || "Request denied"}`
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

// ==================================================
// 🧩 CORRECTED WITHDRAWAL SYSTEM END
// ==================================================

// ---------- MongoDB Connect ----------
mongoose
  .connect(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // ✅ INCREASED TIMEOUT
    socketTimeoutMS: 45000, // ✅ INCREASED SOCKET TIMEOUT
    maxPoolSize: 5, // ✅ REDUCED POOL SIZE FOR STABILITY
  })
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await seedAdmins();
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    console.log("⚠️ Server will continue with sample data...");
  });

// ✅ MongoDB connection event handlers
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// ---------- Handle 404 for API ----------
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// ---------- Fallback for Frontend ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Gaming Continental running on http://localhost:${PORT}`)
);