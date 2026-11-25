const express = require("express");
const router = express.Router();
const History = require("../models/History");
const User = require("../models/User");
const Tournament = require("../models/Tournament");

// ✅ Simple admin session check (NO TOKEN) - FIXED VERSION
function requireAdmin(req, res, next) {
  const { email } = req.body;
  
  console.log("🔍 Admin auth check - Email:", email);
  console.log("🔍 Request body:", req.body);
  
  if (!email) {
    console.log("❌ No email provided");
    return res.status(400).json({ error: "Admin email required" });
  }
  
  // Get loggedInAdmins from app context
  try {
    const loggedInAdmins = req.app.get('loggedInAdmins');
    console.log("🔍 Logged in admins:", loggedInAdmins ? Array.from(loggedInAdmins.keys()) : 'No loggedInAdmins');
    
    if (!loggedInAdmins || !loggedInAdmins.has(email)) {
      console.log(`❌ Admin ${email} not logged in or session expired`);
      return res.status(403).json({ error: "Admin not logged in or session expired" });
    }
    
    // Check if session is expired (24 hours)
    const loginTime = loggedInAdmins.get(email);
    if (Date.now() - loginTime > 24 * 60 * 60 * 1000) {
      loggedInAdmins.delete(email);
      console.log(`❌ Admin session expired for: ${email}`);
      return res.status(403).json({ error: "Session expired" });
    }
    
    console.log(`✅ Admin ${email} is logged in and authorized`);
    next();
  } catch (error) {
    console.error("❌ Error in admin auth:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
}

// ==================== ADMIN TOURNAMENT ENDPOINTS ====================

// ✅ Admin: Get all tournaments
router.post("/admin/all", requireAdmin, async (req, res) => {
  try {
    console.log("📥 Fetching all tournaments for admin...");
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    
    console.log(`✅ Found ${tournaments.length} tournaments`);
    res.json(tournaments);
  } catch (err) {
    console.error("Admin get tournaments error:", err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

// ✅ Admin: Create tournament - FIXED WITH BETTER ERROR HANDLING
router.post("/admin/add", requireAdmin, async (req, res) => {
  try {
    const { title, maxPlayers, minAmount, maxAmount, description, image } = req.body;

    console.log("📥 Creating tournament with data:", { title, maxPlayers, minAmount, maxAmount });

    if (!title || !maxPlayers || !minAmount || !maxAmount || !description) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "All fields are required" });
    }

    // Validate numeric values
    const maxPlayersNum = parseInt(maxPlayers);
    const minAmountNum = parseFloat(minAmount);
    const maxAmountNum = parseFloat(maxAmount);

    if (isNaN(maxPlayersNum) || maxPlayersNum <= 0) {
      return res.status(400).json({ error: "Max players must be a positive number" });
    }

    if (isNaN(minAmountNum) || minAmountNum <= 0) {
      return res.status(400).json({ error: "Minimum amount must be a positive number" });
    }

    if (isNaN(maxAmountNum) || maxAmountNum <= 0) {
      return res.status(400).json({ error: "Maximum amount must be a positive number" });
    }

    if (minAmountNum > maxAmountNum) {
      return res.status(400).json({ error: "Minimum amount cannot be greater than maximum amount" });
    }

    const tournament = await Tournament.create({
      title: title.trim(),
      maxPlayers: maxPlayersNum,
      minAmount: minAmountNum,
      maxAmount: maxAmountNum,
      description: description.trim(),
      image: (image || "").trim(),
      status: "open",
      registeredPlayers: 0,
      players: []
    });

    console.log(`✅ Tournament created: ${tournament.title}`);
    
    res.json({ 
      message: "Tournament created successfully ✅", 
      tournament 
    });
  } catch (err) {
    console.error("❌ Admin create tournament error:", err);
    
    // Handle duplicate title error
    if (err.code === 11000) {
      return res.status(400).json({ error: "A tournament with this title already exists" });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

// ✅ Admin: Close tournament
router.post("/admin/close/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Closing tournament: ${req.params.id}`);
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      console.log("❌ Tournament not found");
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "closed";
    await tournament.save();

    console.log(`✅ Tournament closed: ${tournament.title}`);
    res.json({ message: "Tournament closed successfully ✅", tournament });
  } catch (err) {
    console.error("Admin close tournament error:", err);
    res.status(500).json({ error: "Failed to close tournament" });
  }
});

// ✅ Admin: Open tournament
router.post("/admin/open/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Opening tournament: ${req.params.id}`);
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      console.log("❌ Tournament not found");
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "open";
    await tournament.save();

    console.log(`✅ Tournament opened: ${tournament.title}`);
    res.json({ message: "Tournament reopened successfully ✅", tournament });
  } catch (err) {
    console.error("Admin open tournament error:", err);
    res.status(500).json({ error: "Failed to open tournament" });
  }
});

// ✅ Admin: Delete tournament
router.post("/admin/delete/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Deleting tournament: ${req.params.id}`);
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      console.log("❌ Tournament not found");
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "deleted";
    await tournament.save();

    console.log(`✅ Tournament deleted: ${tournament.title}`);
    res.json({ message: "Tournament deleted successfully ✅" });
  } catch (err) {
    console.error("Admin delete tournament error:", err);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

// ✅ Admin: Get tournament players
router.post("/admin/players/:id", requireAdmin, async (req, res) => {
  try {
    console.log(`📥 Getting players for tournament: ${req.params.id}`);
    const tournament = await Tournament.findById(req.params.id).populate("players.userId");
    if (!tournament) {
      console.log("❌ Tournament not found");
      return res.status(404).json({ error: "Tournament not found" });
    }

    console.log(`✅ Found ${tournament.players.length} players`);
    res.json(tournament.players || []);
  } catch (err) {
    console.error("Admin get players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// ✅ Admin: Set player result
router.post("/admin/result/:regId", requireAdmin, async (req, res) => {
  try {
    const { status, position, prize } = req.body;
    console.log(`📥 Setting player result: ${req.params.regId}`, { status, position, prize });
    
    // Find tournament that contains this registration
    const tournament = await Tournament.findOne({ "players._id": req.params.regId });
    if (!tournament) {
      console.log("❌ Registration not found");
      return res.status(404).json({ error: "Registration not found" });
    }

    const player = tournament.players.id(req.params.regId);
    if (!player) {
      console.log("❌ Player not found");
      return res.status(404).json({ error: "Player not found" });
    }

    player.status = status;
    if (position) player.position = position;
    
    // If win, add prize to user balance
    if (status === "win" && prize > 0) {
      const user = await User.findById(player.userId);
      if (user) {
        user.balance += prize;
        await user.save();

        // Record win history
        await History.create({
          userId: user._id,
          type: "tournament_win",
          amount: prize,
          description: `🏆 Won ${position || 'prize'} in ${tournament.title}`,
          status: "won",
          tournamentId: tournament._id,
          tournamentTitle: tournament.title,
          position: position,
          createdAt: new Date()
        });
      }
    }

    await tournament.save();

    console.log(`✅ Player result updated for: ${tournament.title}`);
    res.json({ message: "Player result updated successfully ✅" });
  } catch (err) {
    console.error("Admin set result error:", err);
    res.status(500).json({ error: "Failed to update player result" });
  }
});

// ✅ Admin: Add balance to user
router.post("/admin/add-balance", requireAdmin, async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    console.log(`📥 Adding balance to user: ${userId}`, { amount, description });
    
    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    user.balance += amount;
    await user.save();

    // Record balance addition
    await History.create({
      userId,
      type: "admin_addition",
      amount: amount,
      description: description || "Money added to your balance",
      status: "completed",
      createdAt: new Date()
    });

    console.log(`✅ Balance added to user: ${user.nickname}, New balance: ${user.balance}`);
    res.json({ 
      message: "Balance added successfully ✅", 
      newBalance: user.balance 
    });
  } catch (err) {
    console.error("Admin add balance error:", err);
    res.status(500).json({ error: "Failed to add balance" });
  }
});

// ==================== USER TOURNAMENT ENDPOINTS ====================

// ✅ User registers for a tournament - FIXED HISTORY
router.post("/register/:id", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const { id } = req.params;

    if (!userId || !amount) {
      return res.status(400).json({ error: "Missing userId or amount" });
    }

    const tournament = await Tournament.findById(id);
    const user = await User.findById(userId);
    if (!tournament || !user) {
      return res.status(404).json({ error: "User or tournament not found" });
    }

    // ✅ Check if tournament is open
    if (tournament.status !== "open") {
      return res.status(400).json({ error: "Tournament is closed for registration" });
    }

    // check if already registered
    const already = tournament.players.find(p => p.userId.toString() === userId);
    if (already) {
      return res.status(400).json({ error: "You already registered for this tournament" });
    }

    // check balance
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // check amount limits
    if (amount < tournament.minAmount || amount > tournament.maxAmount) {
      return res.status(400).json({ error: `Amount must be between ${tournament.minAmount} and ${tournament.maxAmount}` });
    }

    // check max players
    if (tournament.registeredPlayers >= tournament.maxPlayers) {
      return res.status(400).json({ error: "Tournament is full" });
    }

    // deduct balance
    user.balance -= amount;
    await user.save();

    // register player
    tournament.players.push({ 
      userId, 
      amount,
      registeredAt: new Date()
    });
    tournament.registeredPlayers += 1;
    await tournament.save();

    // ✅ FIXED: CREATE HISTORY RECORD WITH POSITIVE AMOUNT
    await History.create({
      userId,
      type: "tournament_registration",
      amount: amount, // ✅ POSITIVE AMOUNT - frontend will handle signage
      description: `Registered for tournament: ${tournament.title}`,
      status: "completed",
      tournamentId: tournament._id,
      tournamentTitle: tournament.title, // Added for easy display
      createdAt: new Date()
    });

    res.json({ 
      message: "Registered successfully ✅", 
      tournament: {
        id: tournament._id,
        title: tournament.title,
        registeredPlayers: tournament.registeredPlayers,
        userAmount: amount,
        newBalance: user.balance
      }
    });
  } catch (err) {
    console.error("Register tournament error:", err);
    res.status(500).json({ error: "Failed to register" });
  }
});

// ✅ Tournament win route - FIXED HISTORY
router.post("/:tournamentId/win/:userId", async (req, res) => {
  try {
    const { tournamentId, userId } = req.params;
    const { prizeAmount, position = "1st" } = req.body;

    const tournament = await Tournament.findById(tournamentId);
    const user = await User.findById(userId);

    if (!tournament || !user) {
      return res.status(404).json({ error: "Tournament or user not found" });
    }

    // Credit prize to user
    user.balance += prizeAmount;
    await user.save();

    // ✅ FIXED: CREATE WIN HISTORY WITH POSITIVE AMOUNT
    await History.create({
      userId,
      type: "tournament_win",
      amount: prizeAmount, // ✅ POSITIVE AMOUNT
      description: `🏆 Won ${position} place in ${tournament.title}`,
      status: "won",
      tournamentId: tournament._id,
      tournamentTitle: tournament.title,
      position: position,
      createdAt: new Date()
    });

    res.json({ 
      message: `Prize of ₦${prizeAmount.toLocaleString()} awarded successfully`,
      newBalance: user.balance 
    });

  } catch (err) {
    console.error("Tournament win error:", err);
    res.status(500).json({ error: "Failed to process tournament win" });
  }
});

// ✅ Tournament loss route - FIXED HISTORY
router.post("/:tournamentId/lose/:userId", async (req, res) => {
  try {
    const { tournamentId, userId } = req.params;
    const { lostAmount = 0 } = req.body;

    const tournament = await Tournament.findById(tournamentId);
    const user = await User.findById(userId);

    if (!tournament || !user) {
      return res.status(404).json({ error: "Tournament or user not found" });
    }

    // ✅ CREATE LOSS HISTORY WITH POSITIVE AMOUNT
    await History.create({
      userId,
      type: "tournament_lose",
      amount: lostAmount, // ✅ POSITIVE AMOUNT - frontend will show as negative
      description: `Participated in tournament: ${tournament.title}`,
      status: "lost",
      tournamentId: tournament._id,
      tournamentTitle: tournament.title,
      createdAt: new Date()
    });

    res.json({ 
      message: "Tournament participation recorded",
    });

  } catch (err) {
    console.error("Tournament loss error:", err);
    res.status(500).json({ error: "Failed to record tournament loss" });
  }
});

module.exports = router;