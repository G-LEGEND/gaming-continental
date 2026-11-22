// ===============================
// 🌍 GAMING CONTINENTAL SERVER
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
const PORT = process.env.PORT || 5000;

// ---------- Middlewares ----------
app.use(
  cors({
    origin: [
      "https://h-gamingcontinental.netlify.app",
      "https://gaming-continental.onrender.com",
      "https://gamingcontinental.xyz",
      "http://gamingcontinental.xyz",
      "http://localhost:3000",
      "http://localhost:5000",
      "http://localhost:10000"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
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
let loggedInAdmins = new Map();
app.set('loggedInAdmins', loggedInAdmins);

// ---------- Simple Admin Middleware ----------
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  if (!email) return res.status(400).json({ error: "Admin email required" });
  if (!loggedInAdmins.has(email)) return res.status(403).json({ error: "Admin not logged in" });
  
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
    { email: "bayoabeeb110@gmail.com", password: "admin1960" },
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

// ---------- Auth Me Endpoint ----------
app.get("/auth/me", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      _id: user._id,
      email: user.email,
      nickname: user.nickname,
      balance: user.balance,
      fifaPoints: user.fifaPoints || 0,
      snookerPoints: user.snookerPoints || 0,
      rank: user.rank || 0,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      bankDetails: user.bankDetails,
      accountNumber: user.accountNumber,
      bankName: user.bankName
    });
  } catch (err) {
    console.error("Auth me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Admin Login ----------
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    loggedInAdmins.set(email, Date.now());
    
    res.json({ message: "Admin login successful ✅", admin: { email }, loggedIn: true });
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

// ---------- ADMIN WITHDRAWAL ENDPOINTS ----------
app.post("/admin/withdrawals/approve/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await Withdraw.findById(id).populate("userId");
    
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
    if (withdrawal.status !== "pending") return res.status(400).json({ error: "Withdrawal already processed" });
    if (withdrawal.userId.balance < withdrawal.amount) return res.status(400).json({ error: "User has insufficient balance" });

    await User.findByIdAndUpdate(withdrawal.userId._id, { $inc: { balance: -withdrawal.amount } });

    withdrawal.status = "approved";
    await withdrawal.save();

    await History.findOneAndUpdate(
      { transactionId: withdrawal._id.toString(), type: "withdraw" },
      { status: "completed", description: `Withdrawal approved - ${withdrawal.amount} sent to ${withdrawal.accountDetails?.bankName || 'bank'}` }
    );

    res.json({ message: "Withdrawal approved successfully ✅", withdrawal });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

app.post("/admin/withdrawals/reject/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const withdrawal = await Withdraw.findById(id);
    
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
    if (withdrawal.status !== "pending") return res.status(400).json({ error: "Withdrawal already processed" });

    withdrawal.status = "rejected";
    withdrawal.adminNote = note || "Request rejected";
    await withdrawal.save();

    await History.findOneAndUpdate(
      { transactionId: withdrawal._id.toString(), type: "withdraw" },
      { status: "rejected", description: `Withdrawal rejected - ${withdrawal.adminNote}` }
    );

    res.json({ message: "Withdrawal rejected successfully ❌", withdrawal });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

// ---------- TEMPORARY ADMIN DEPOSIT ENDPOINTS ----------
app.post("/admin/deposits", requireAdmin, async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate("userId", "email nickname")
      .populate("methodId", "bankName accountName accountNumber")
      .sort({ createdAt: -1 });
    res.json(deposits);
  } catch (err) {
    console.error("❌ Error fetching deposits:", err);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

app.post("/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("nickname email balance fifaPoints snookerPoints")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdraw.find()
      .populate("userId", "nickname email balance phoneNumber bankDetails")
      .sort({ createdAt: -1 });
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
const withdrawRoutes = require("./routes/withdraw");
const gameRoutes = require("./routes/game");
const miniRoutes = require("./routes/mini");
const paystackRoutes = require("./routes/paystack"); // ✅ ADDED PAYSTACK

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/livescore", livescoreRoutes);
app.use("/api/match", matchRoutes);
app.use("/deposit", depositRoutes);
app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/withdraw", withdrawRoutes);
app.use("/game", gameRoutes);
app.use("/paystack", paystackRoutes);
app.use("/mini", miniRoutes);

app.use("/admin/livestream", livestreamRoutes);
app.use("/admin/tournament", tournamentRoutes);
// ===============================
// 👤 ADMIN USER MANAGEMENT ROUTES
// ===============================

// Get all users (full details)
app.post("/admin/users/all", requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update user balance (+ or -)
app.post("/admin/users/:id/balance", requireAdmin, async (req, res) => {
  try {
    const { amount, action, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (action === "add") {
      user.balance = Number(user.balance) + numericAmount;
    } else if (action === "remove") {
      if (user.balance < numericAmount) return res.status(400).json({ error: "User balance is too low to remove this amount" });
      user.balance = Number(user.balance) - numericAmount;
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    await user.save();

    // Log in History
    await History.create({
      userId: user._id,
      type: action === "add" ? "deposit" : "withdraw",
      amount: action === "add" ? numericAmount : -numericAmount,
      description: reason || `Admin ${action === "add" ? "added" : "removed"} balance manually`,
      status: "completed",
      createdAt: new Date()
    });

    res.json({ message: "Balance updated successfully", newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: "Failed to update balance" });
  }
});

// Block / Unblock user (Uses the status field)
app.post("/admin/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body; 
    if (!["active", "banned", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({ 
      message: `User status updated to ${status} ✅`, 
      user 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Delete User Account
app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User account deleted permanently 🗑️" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});


app.use("/admin", adminRoutes);

app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);

// ✅ PAYSTACK PUBLIC KEY ENDPOINT
app.get("/paystack/public-key", (req, res) => {
  res.json({ key: process.env.PAYSTACK_PUBLIC_KEY });
});

// ---------- Manual Withdrawal (Legacy) ----------
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount, method = "Bank Transfer" } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: "Missing data" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < amount) return res.status(400).json({ error: "Insufficient balance" });

    // ✅ Prevent duplicate pending withdrawal requests
    const existingPending = await Withdraw.findOne({ userId, status: "pending" });
    if (existingPending) {
      return res.status(400).json({ error: "You already have a pending withdrawal request. Please wait for admin approval." });
    }

    const withdraw = await Withdraw.create({
      userId, username: user.nickname, amount, method,
      accountDetails: user.bankDetails, status: "pending",
    });

    await History.create({
      userId, type: "withdraw", amount,
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
