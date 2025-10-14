const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const User = require("../models/User");
const History = require("../models/History");

// ✅ Get all tournaments for public viewing (NO AUTH REQUIRED)
router.get("/", async (req, res) => {
  try {
    const tournaments = await Tournament.find({ status: { $ne: "deleted" } }).sort({ createdAt: -1 });
    res.json(tournaments);
  } catch (err) {
    console.error("Public tournament fetch error:", err);
    res.status(500).json({ error: "Failed to load tournaments" });
  }
});

// ✅ ADMIN: Get tournament players with populated user data
router.get("/players/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('players.userId', 'nickname email balance phoneNumber');
    
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json(tournament.players || []);
  } catch (err) {
    console.error("Error fetching tournament players:", err);
    res.status(500).json({ error: "Failed to fetch tournament players" });
  }
});

// ✅ ADMIN: Create new tournament
router.post("/add", async (req, res) => {
  try {
    const { title, maxPlayers, minAmount, maxAmount, description, image } = req.body;
    
    if (!title || !maxPlayers || !minAmount || !maxAmount || !description) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newTournament = await Tournament.create({
      title,
      maxPlayers: parseInt(maxPlayers),
      minAmount: parseFloat(minAmount),
      maxAmount: parseFloat(maxAmount),
      description,
      image: image || "",
      status: "open"
    });

    res.status(201).json({ 
      message: "Tournament created successfully ✅", 
      tournament: newTournament 
    });
  } catch (err) {
    console.error("Error creating tournament:", err);
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

// ✅ ADMIN: Close tournament
router.put("/close/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "closed";
    await tournament.save();

    res.json({ message: "Tournament closed successfully ✅" });
  } catch (err) {
    console.error("Error closing tournament:", err);
    res.status(500).json({ error: "Failed to close tournament" });
  }
});

// ✅ ADMIN: Open tournament
router.put("/open/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "open";
    await tournament.save();

    res.json({ message: "Tournament reopened successfully ✅" });
  } catch (err) {
    console.error("Error opening tournament:", err);
    res.status(500).json({ error: "Failed to reopen tournament" });
  }
});

// ✅ ADMIN: Delete tournament
router.delete("/delete/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    tournament.status = "deleted";
    await tournament.save();

    res.json({ message: "Tournament deleted successfully ✅" });
  } catch (err) {
    console.error("Error deleting tournament:", err);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

// ✅ ADMIN: Set player result
router.post("/result/:regId", async (req, res) => {
  try {
    const { status, position, prize } = req.body;
    
    // Find tournament that contains this registration
    const tournament = await Tournament.findOne({ 
      "players._id": req.params.regId 
    });
    
    if (!tournament) {
      return res.status(404).json({ error: "Registration not found" });
    }

    // Find and update the player registration
    const player = tournament.players.id(req.params.regId);
    if (!player) {
      return res.status(404).json({ error: "Player registration not found" });
    }

    player.status = status;
    if (position) player.position = position;
    if (prize) player.prize = parseFloat(prize);

    // If player won, add prize to their balance
    if (status === "win" && prize > 0) {
      const user = await User.findById(player.userId);
      if (user) {
        user.balance += parseFloat(prize);
        await user.save();

        // Create win history
        await History.create({
          userId: player.userId,
          type: "tournament_win",
          amount: parseFloat(prize),
          description: `🏆 Won ${position || '1st'} place in ${tournament.title}`,
          status: "won",
          tournamentId: tournament._id,
          tournamentTitle: tournament.title,
          position: position || '1st',
          createdAt: new Date()
        });
      }
    }

    await tournament.save();

    res.json({ message: "Player result updated successfully ✅" });
  } catch (err) {
    console.error("Error setting player result:", err);
    res.status(500).json({ error: "Failed to set player result" });
  }
});

// ✅ ADMIN: Add balance to user
router.post("/add-balance", async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.balance += parseFloat(amount);
    await user.save();

    // Create balance addition history
    await History.create({
      userId,
      type: "admin_deposit",
      amount: parseFloat(amount),
      description: description || "Admin balance addition",
      status: "completed",
      createdAt: new Date()
    });

    res.json({ 
      message: "Balance added successfully ✅",
      newBalance: user.balance 
    });
  } catch (err) {
    console.error("Error adding balance:", err);
    res.status(500).json({ error: "Failed to add balance" });
  }
});

// ✅ User registers for a tournament - PUBLIC VERSION (NO TOKEN REQUIRED)
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

    // ✅ CREATE TOURNAMENT HISTORY RECORD
    await History.create({
      userId,
      type: "tournament_registration",
      amount: -amount, // Negative for registration fee
      description: `Registered for tournament: ${tournament.title}`,
      status: "completed",
      tournamentId: tournament._id,
      tournamentTitle: tournament.title
    });

    res.json({ message: "Registered successfully ✅", tournament });
  } catch (err) {
    console.error("Register tournament error:", err);
    res.status(500).json({ error: "Failed to register" });
  }
});

module.exports = router;