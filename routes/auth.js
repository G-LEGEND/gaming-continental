const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_change_this";

// ----------------- Helper: Create JWT -----------------
function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      isAdmin: user.isAdmin || false,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ----------------- Helper: Check if user is blocked -----------------
function checkBlockedStatus(user) {
  if (user.status === "banned") {
    return { blocked: true, message: "Your account has been banned. Please contact support." };
  }
  if (user.status === "suspended") {
    return { blocked: true, message: "Your account is suspended. Please contact support." };
  }
  if (user.status === "inactive") {
    return { blocked: true, message: "Your account is inactive. Please contact support." };
  }
  return { blocked: false };
}

// ----------------- REGISTER -----------------
router.post("/register", async (req, res) => {
  try {
    const { nickname, email, password, confirmPassword } = req.body;

    if (!nickname || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      nickname,
      email,
      password: hashed,
      balance: 0,
      points: 0,
      isAdmin: false,
      status: "active",
    });
    await user.save();

    const token = createToken(user);

    res.json({
      token,
      user: {
        _id: user._id,
        nickname: user.nickname,
        email: user.email,
        balance: user.balance,
        points: user.points,
        isAdmin: user.isAdmin,
        status: user.status,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        accountNumber: user.accountNumber || "",
        bankName: user.bankName || "",
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

// ----------------- LOGIN -----------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // ✅ Block BEFORE password check to avoid leaking valid passwords
    const blocked = checkBlockedStatus(user);
    if (blocked.blocked) {
      return res.status(403).json({ error: blocked.message });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // ✅ Double-check after password match (in case status changed mid-request)
    const blocked2 = checkBlockedStatus(user);
    if (blocked2.blocked) {
      return res.status(403).json({ error: blocked2.message });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        _id: user._id,
        nickname: user.nickname,
        email: user.email,
        balance: user.balance,
        points: user.points,
        isAdmin: user.isAdmin,
        status: user.status,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        accountNumber: user.accountNumber || "",
        bankName: user.bankName || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ----------------- GET CURRENT USER -----------------
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Reject banned/suspended tokens even if JWT is valid
    const blocked = checkBlockedStatus(user);
    if (blocked.blocked) {
      return res.status(403).json({ error: blocked.message, status: user.status });
    }

    res.json(user);
  } catch (err) {
    console.error("Auth /me error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
