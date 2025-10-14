// ===============================
// 🌍 GAMING CONTINENTAL SERVER
// ===============================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ---------- Config ----------
require("dotenv").config();
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "gamingcontinental_secret_2025";
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://olaoluwa705_db_user:olaoluwanishola_1@cluster0.r4pqjm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const PORT = process.env.PORT || 5000;

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
const History = require("./models/History");

// ---------- JWT Middlewares ----------
function verifyUser(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

function verifyAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin)
      return res.status(403).json({ error: "Admin access required" });
    req.admin = decoded;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
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
app.use("/deposit", depositRoutes);
app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/admin/livestream", verifyAdmin, livestreamRoutes);
app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);
app.use("/admin/tournament", verifyAdmin, tournamentRoutes);
app.use("/admin", verifyAdmin, adminRoutes);

// ---------- Admin Login ----------
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

// ---------- History (Sample + Real Data Fallback) ----------
app.get("/user/transactions", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    if (mongoose.connection.readyState !== 1) {
      return res.json(createSampleHistory(userId));
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let transactions = await History.find({ userId })
      .populate("tournamentId", "title image")
      .sort({ createdAt: -1 })
      .limit(100);

    if (transactions.length === 0) transactions = createSampleHistory(userId);
    res.json(transactions);
  } catch {
    res.json(createSampleHistory(req.query.userId || "unknown"));
  }
});

function createSampleHistory(userId) {
  const now = new Date();
  return [
    {
      _id: "1",
      userId,
      type: "deposit",
      amount: 10000,
      description: "Bank Transfer Deposit",
      status: "completed",
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
    },
    {
      _id: "2",
      userId,
      type: "tournament_registration",
      amount: 2000,
      description: "Registered for FIFA 24 Championship",
      status: "completed",
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
  ];
}

// ---------- Withdrawal Routes ----------
app.post("/withdraw/", verifyUser, async (req, res) => {
  try {
    const { amount, method = "Bank Transfer" } = req.body;
    const userId = req.user.id;

    if (!amount || amount < 1000)
      return res.status(400).json({ error: "Minimum withdrawal is ₦1000" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < amount)
      return res.status(400).json({ error: "Insufficient balance" });
    if (!user.bankDetails?.accountNumber)
      return res.status(400).json({ error: "Add bank details first" });

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
      description: `Withdrawal request - ${method}`,
      status: "pending",
      transactionId: withdraw._id.toString(),
      createdAt: new Date(),
    });

    res.json({ message: "Withdrawal request submitted ✅", withdraw });
  } catch (err) {
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
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
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// ---------- Start Server ----------
app.listen(PORT, () =>
  console.log(`🚀 Gaming Continental running on port ${PORT}`)
);