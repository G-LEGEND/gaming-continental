const express = require("express");
const router = express.Router();
const History = require("../models/History");
const User = require("../models/User");
const Tournament = require("../models/Tournament");

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