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
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://olaoluwa705_db_user:olaoluwanishola_1@cluster0.r4pqjm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const PORT = process.env.PORT || 10000;

// ---------- Middlewares ----------
app.use(cors({
  origin: ["https://h-gamingcontinental.netlify.app", "https://gaming-continental.onrender.com", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
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

// ---------- Auth Endpoints ----------
app.get("/auth/me", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      _id: user._id, email: user.email, nickname: user.nickname,
      balance: user.balance, fifaPoints: user.fifaPoints || 0,
      snookerPoints: user.snookerPoints || 0, rank: user.rank || 0
    });
  } catch (err) {
    console.error("Auth me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

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

// ---------- Routes ----------
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const tournamentRoutes = require("./routes/tournament");
const publicTournamentRoutes = require("./routes/publicTournament");
const livescoreRoutes = require("./routes/livescore"); // ✅ USING ROUTES FILE
const matchRoutes = require("./routes/match");
const adminRoutes = require("./routes/admin");
const depositRoutes = require("./routes/deposit");
const paymentRoutes = require("./routes/payment");
const betRoutes = require("./routes/bet");
const livestreamRoutes = require("./routes/livestream");
const withdrawRoutes = require("./routes/withdraw");

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/livescore", livescoreRoutes); // ✅ USING ROUTES FILE
app.use("/api/match", matchRoutes);
app.use("/deposit", depositRoutes);
app.use("/payment", paymentRoutes);
app.use("/bets", betRoutes);
app.use("/livestream", livestreamRoutes);
app.use("/withdraw", withdrawRoutes);
app.use("/admin/livestream", livestreamRoutes);
app.use("/admin/tournament", tournamentRoutes);
app.use("/admin", adminRoutes);
app.use("/tournament", tournamentRoutes);
app.use("/tournament/public", publicTournamentRoutes);

// ---------- Health Check ----------
app.get("/auth/test", (req, res) => {
  res.json({ message: "Gaming Continental API is live ✅" });
});

// Test endpoint for livescore
app.get("/livescore/test", (req, res) => {
  res.json({ 
    message: "Live scores endpoint is working! ✅",
    timestamp: new Date().toISOString()
  });
});

// ---------- MongoDB Connect ----------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 30000,
}).then(async () => {
  console.log("✅ MongoDB Connected");
  await seedAdmins();
}).catch((err) => console.error("❌ MongoDB Error:", err.message));

// ---------- Serve Frontend ----------
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ---------- Start Server ----------
app.listen(PORT, () => console.log(`🚀 Gaming Continental running on port ${PORT}`));