const express = require("express");
const router = express.Router();
const History = require("../models/History");
const User = require("../models/User");
// ✅ User registers for a tournament - UPDATED WITH HISTORY
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
    const History = require("../models/History");
    await History.create({
      userId,
      type: "tournament",
      amount: -amount, // Negative for registration fee
      description: `Registered for tournament: ${tournament.title}`,
      status: "completed",
      tournamentId: tournament._id
    });

    res.json({ message: "Registered successfully ✅", tournament });
  } catch (err) {
    console.error("Register tournament error:", err);
    res.status(500).json({ error: "Failed to register" });
  }
});


module.exports = router;