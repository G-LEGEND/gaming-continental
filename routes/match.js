// routes/match.js
const express = require("express");
const router = express.Router();
const Match = require("../models/Match");
const Bet = require("../models/Bet");
const User = require("../models/User");

function evaluateSelection(selection, home, away) {
  const total = Number(home) + Number(away);
  const mk = (selection.marketKey || "").toUpperCase();

  if (mk === "1X2") {
    if (selection.selectionKey === "home" && home > away) return "won";
    if (selection.selectionKey === "away" && away > home) return "won";
    if (selection.selectionKey === "draw" && home === away) return "won";
    return "lost";
  }

  if (mk === "GG" || mk === "GG/NG") {
    const sel = (selection.selectionKey || "").toLowerCase();
    if ((home > 0 && away > 0) && (sel === "gg" || sel === "yes")) return "won";
    if ((home === 0 || away === 0) && (sel === "ng" || sel === "no")) return "won";
    return "lost";
  }

  if (mk === "OU" || mk.startsWith("O/U") || mk === "O/U") {
    const key = selection.selectionKey || "";
    if (key.startsWith("over_")) {
      const line = parseFloat(key.split("_")[1] || "2.5");
      return total > line ? "won" : "lost";
    }
    if (key.startsWith("under_")) {
      const line = parseFloat(key.split("_")[1] || "2.5");
      return total < line ? "won" : "lost";
    }
  }

  if (mk === "DC") {
    if (selection.selectionKey === "1X" && home >= away) return "won";
    if (selection.selectionKey === "12" && home !== away) return "won";
    if (selection.selectionKey === "X2" && away >= home) return "won";
    return "lost";
  }

  return "lost";
}

async function reevaluateBet(bet) {
  const anyLost = bet.selections.some(s => s.result === "lost");
  const allWon = bet.selections.every(s => s.result === "won");

  if (anyLost) {
    bet.status = "lost";
  } else if (allWon) {
    bet.status = "won";
    if (!bet.isPaid) {
      const user = await User.findById(bet.userId);
      if (user) {
        user.balance = Number(user.balance) + Number(bet.potentialWin);
        await user.save();
        bet.isPaid = true;
        console.log(`💰 Paid ₦${bet.potentialWin} for bet ${bet._id}`);
      }
    }
  } else {
    bet.status = "pending";
  }

  await bet.save();
  return bet;
}

router.post("/create", async (req, res) => {
  try {
    const { home, away, date, time, odds, isLive } = req.body;
    if (!home || !away) return res.status(400).json({ error: "Missing team names" });
    if (!odds || typeof odds !== "object") return res.status(400).json({ error: "Missing odds object" });

    const newMatch = await Match.create({
      home, away,
      date: date || new Date().toISOString().split("T")[0],
      time: time || "00:00",
      odds, isLive: !!isLive,
      homeGoals: 0, awayGoals: 0, result: "0-0", status: "open",
    });

    return res.json({ message: "✅ Match created successfully", match: newMatch });
  } catch (err) {
    console.error("Match creation error:", err);
    return res.status(500).json({ error: "Failed to create match", details: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.json(matches);
  } catch (err) {
    console.error("Fetch matches error:", err);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    Object.assign(match, req.body);
    match.result = `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}`;
    await match.save();

    return res.json({ message: "✅ Match updated", match });
  } catch (err) {
    console.error("Update match error:", err);
    res.status(500).json({ error: "Failed to update match", details: err.message });
  }
});

router.put("/:id/live", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status === "finished") return res.status(400).json({ error: "Cannot set live on a finished match" });

    match.isLive = !match.isLive;
    await match.save();
    return res.json({ message: `Live mode ${match.isLive ? "enabled" : "disabled"}`, match });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle live", details: err.message });
  }
});

router.put("/:id/close", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    match.status = match.status === "closed" ? "open" : "closed";
    await match.save();
    return res.json({ message: `Market is now ${match.status.toUpperCase()}`, match });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle close", details: err.message });
  }
});

router.put("/:id/goals", async (req, res) => {
  try {
    const { homeGoals, awayGoals } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    match.homeGoals = Number(homeGoals);
    match.awayGoals = Number(awayGoals);
    match.result = `${match.homeGoals}-${match.awayGoals}`;
    await match.save();

    if (match.status === "finished") {
      const bets = await Bet.find({ "selections.matchId": match._id });
      for (const bet of bets) {
        for (const selection of bet.selections) {
          if (selection.matchId.toString() === match._id.toString()) {
            selection.result = evaluateSelection(selection, match.homeGoals, match.awayGoals);
          }
        }
        await reevaluateBet(bet);
      }
    }

    return res.json({ message: "⚽ Goals updated", match });
  } catch (err) {
    console.error("Goal update error:", err);
    res.status(500).json({ error: "Goal update failed", details: err.message });
  }
});

// ✅ FIXED FINISH ROUTE — updates selections for ALL bets (even if already LOST)
router.put("/:id/finish", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    if (match.homeGoals === undefined || match.awayGoals === undefined)
      return res.status(400).json({ error: "Cannot finish match without goals" });

    match.status = "finished";
    match.isLive = false;
    await match.save();

    // ← NO status:"pending" filter — grab ALL bets containing this match
    const bets = await Bet.find({ "selections.matchId": match._id });

    for (const bet of bets) {
      let updated = false;
      for (const selection of bet.selections) {
        if (selection.matchId.toString() === match._id.toString()) {
          selection.result = evaluateSelection(selection, match.homeGoals, match.awayGoals);
          updated = true;
        }
      }
      if (updated) {
        await reevaluateBet(bet);
      }
    }

    return res.json({ message: "✅ Match finished - all selections updated", match });
  } catch (err) {
    console.error("Finish error:", err);
    res.status(500).json({ error: "Failed to finish match", details: err.message });
  }
});

router.put("/:id/settle", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const base = `${req.protocol}://${req.get("host")}`;
    let msg = "";
    try {
      const r = await fetch(`${base}/bets/check/${match._id}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (r.ok) { const d = await r.json(); msg = ` - ${d.message || "ok"}`; }
    } catch (e) { msg = ` - settle failed: ${e.message}`; }

    return res.json({ message: "✅ Settlement triggered" + msg, match });
  } catch (err) {
    res.status(500).json({ error: "Failed to settle match", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const existingBets = await Bet.find({ "selections.matchId": req.params.id });
    if (existingBets.length > 0) {
      match.status = "deleted";
      await match.save();
      return res.json({ message: "✅ Match marked as deleted (bets exist)", match });
    } else {
      await Match.findByIdAndDelete(req.params.id);
      return res.json({ message: "✅ Match deleted completely", match });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to delete match", details: err.message });
  }
});

module.exports = router;
