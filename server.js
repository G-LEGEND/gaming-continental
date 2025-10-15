// ===============================
// 🌍 GAMING CONTINENTAL SERVER (Updated with Auth Me Endpoint)
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
    allowedHeaders: ["Content-Type", "Authorization"],
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

// ---------- Auth Me Endpoint (NEW) ----------
app.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.split(" ")[1];
    
    // Simple token validation - in a real app you'd verify JWT here
    // For now, we'll accept any token and get user from query param
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: "User ID required" });
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

// ---------- Admin Login ----------
let loggedInAdmins = new Set(); // simple in-memory session

app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    loggedInAdmins.add(email);
    res.json({ message: "Admin login successful ✅", admin: { email } });
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

// ---------- Middleware: simple admin check ----------
function requireAdmin(req, res, next) {
  const { email } = req.body;
  if (!loggedInAdmins.has(email))
    return res.status(403).json({ error: "Admin not logged in" });
  next();
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

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/livescore", livescoreRoutes);
app.use("/api/match", matchRoutes);
app.use("/deposit", depositRoutes);
app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/admin/livestream", requireAdmin, livestreamRoutes);
app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);
app.use("/admin/tournament", requireAdmin, tournamentRoutes);
app.use("/admin", requireAdmin, adminRoutes);

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
update my server.js too 