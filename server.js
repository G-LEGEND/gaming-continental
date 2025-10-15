// ===============================
// 🌍 GAMING CONTINENTAL SERVER (NO TOKENS)
// ===============================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

// ---------- Config ----------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://olaoluwa705_db_user:olaoluwanishola_1@cluster0.r4pqjm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const PORT = process.env.PORT || 10000;

// ---------- Middlewares ----------
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- MongoDB Models ----------
const Admin = require("./models/Admin");
const Tournament = require("./models/Tournament");
const PaymentMethod = require("./models/PaymentMethod");
const Deposit = require("./models/Deposit");
const User = require("./models/User");
const Match = require("./models/Match");
const Bet = require("./models/Bet");
const Withdraw = require("./models/Withdrawal");
const History = require("./models/History");

// ---------- Admin Session Management ----------
let loggedInAdmins = new Map(); // email -> timestamp

// Make it available to all routes
app.set('loggedInAdmins', loggedInAdmins);

// ---------- Simple Admin Middleware ----------
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Admin email required" });
  }
  
  if (!loggedInAdmins.has(email)) {
    return res.status(403).json({ error: "Admin not logged in" });
  }
  
  // Check if session is expired (24 hours)
  const loginTime = loggedInAdmins.get(email);
  if (Date.now() - loginTime > 24 * 60 * 60 * 1000) {
    loggedInAdmins.delete(email);
    return res.status(403).json({ error: "Session expired" });
  }
  
  next();
}

// ---------- Seed Default Admins ----------
async function seedAdmins() {
  const admins = [
    { email: "olaoluwa705@gmail.com", password: "Olaoluwa705" },
    { email: "pippinpaul069@gmail.com", password: "PaulPaul" },
  ];

  for (const a of admins) {
    const existing = await Admin.findOne({ email: a.email });
    if (!existing) {
      const hashed = await bcrypt.hash(a.password, 10);
      await Admin.create({ email: a.email, password: hashed });
      console.log(`✅ Admin created: ${a.email}`);
    }
  }
}

// ---------- Auth Me Endpoint (UPDATED - NO TOKEN) ----------
app.get("/auth/me", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return user data without password
    res.json({
      _id: user._id,
      email: user.email,
      nickname: user.nickname,
      balance: user.balance,
      fifaPoints: user.fifaPoints || 0,
      snookerPoints: user.snookerPoints || 0,
      rank: user.rank || 0
    });
  } catch (err) {
    console.error("Auth me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Admin Login (UPDATED - SIMPLE SESSION) ----------
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    // Store login session
    loggedInAdmins.set(email, Date.now());
    
    res.json({ 
      message: "Admin login successful ✅", 
      admin: { email },
      loggedIn: true 
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/admin/logout", (req, res) => {
  const { email } = req.body;
  loggedInAdmins.delete(email);
  res.json({ message: "Admin logged out ✅" });
});

// ---------- ADMIN WITHDRAWAL ENDPOINTS (ADD THESE) ----------

// ✅ Approve withdrawal (NO TOKEN - session based) - FIXED ENDPOINT
app.post("/admin/withdrawals/approve/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 Approving withdrawal via admin endpoint: ${id}`);
    
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

    console.log(`✅ Withdrawal ${id} approved successfully via admin endpoint`);
    res.json({ 
      message: "Withdrawal approved successfully ✅", 
      withdrawal 
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// ✅ Reject withdrawal (NO TOKEN - session based) - FIXED ENDPOINT
app.post("/admin/withdrawals/reject/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    console.log(`📥 Rejecting withdrawal via admin endpoint: ${id}`);
    
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

    console.log(`✅ Withdrawal ${id} rejected successfully via admin endpoint`);
    res.json({ 
      message: "Withdrawal rejected successfully ❌", 
      withdrawal 
    });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

// ---------- TEMPORARY ADMIN DEPOSIT ENDPOINTS ----------

// ✅ Get all deposits (NO TOKEN - session based)
app.post("/admin/deposits", requireAdmin, async (req, res) => {
  try {
    console.log("📥 Fetching all deposits for admin...");
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

// ✅ Get all users (NO TOKEN - session based)
app.post("/admin/users", requireAdmin, async (req, res) => {
  try {
    console.log("📥 Fetching all users for admin...");
    const users = await User.find()
      .select("nickname email balance fifaPoints snookerPoints")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${users.length} users`);
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ✅ Get all withdrawals (NO TOKEN - session based)
app.post("/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    console.log("📥 Fetching all withdrawals for admin...");
    const withdrawals = await Withdraw.find()
      .populate("userId", "nickname email balance phoneNumber bankDetails")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${withdrawals.length} withdrawals`);
    res.json(withdrawals);
  } catch (err) {
    console.error("❌ Error fetching withdrawals:", err);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

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
const withdrawRoutes = require("./routes/withdraw"); // ✅ ADD THIS LINE

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/livescore", livescoreRoutes);
app.use("/api/match", matchRoutes);

// ✅ Use deposit routes with session-based authentication
app.use("/deposit", depositRoutes);

app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/withdraw", withdrawRoutes); // ✅ ADD THIS LINE

// Comment out these admin-specific routes since we're using the main ones
// app.use("/admin/livestream", requireAdmin, livestreamRoutes);
// app.use("/admin/tournament", requireAdmin, tournamentRoutes);
// app.use("/admin", requireAdmin, adminRoutes);

app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);

// ---------- Withdrawals ----------
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount, method = "Bank Transfer" } = req.body;
    if (!userId || !amount)
      return res.status(400).json({ error: "Missing data" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < amount)
      return res.status(400).json({ error: "Insufficient balance" });

    const withdraw = await Withdraw.create({
      userId,
      username: user.nickname,
      amount,
      method,
      accountDetails: user.bankDetails,
      status: "pending",
    });

    await History.create({
      userId,
      type: "withdraw",
      amount,
      description: `Withdrawal - ${method}`,
      status: "pending",
      transactionId: withdraw._id.toString(),
      createdAt: new Date(),
    });

    res.json({ message: "Withdrawal request submitted ✅", withdraw });
  } catch (err) {
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// ---------- Health Check ----------
app.get("/auth/test", (req, res) => {
  res.json({ message: "Gaming Continental API is live ✅" });
});

// ---------- MongoDB Connect ----------
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
  })
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await seedAdmins();
  })
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

// ---------- Serve Frontend ----------
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// ---------- Start Server ----------
app.listen(PORT, () =>
  console.log(`🚀 Gaming Continental running on port ${PORT}`)
);