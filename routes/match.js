// routes/match.js
const express = require("express");
const router = express.Router();
const Match = require("../models/Match");
const Bet = require("../models/Bet");
const User = require("../models/User");

/**
 * Helper function: Evaluate a single selection against the current match result
 * Returns "won" | "lost"
 */
function evaluateSelection(selection, home, away) {
  const total = Number(home) + Number(away);
  const mk = (selection.marketKey || "").toUpperCase();

  // 1X2
  if (mk === "1X2") {
    if (selection.selectionKey === "home" && home > away) return "won";
    if (selection.selectionKey === "away" && away > home) return "won";
    if (selection.selectionKey === "draw" && home === away) return "won";
    return "lost";
  }

  // GG / NG
  if (mk === "GG" || mk === "GG/NG") {
    const sel = (selection.selectionKey || "").toLowerCase();
    if ((home > 0 && away > 0) && (sel === "gg" || sel === "yes")) return "won";
    if ((home === 0 || away === 0) && (sel === "ng" || sel === "no")) return "won";
    return "lost";
  }

  // Over / Under (supports 1.5 – 10.5)
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

  // Double Chance (DC)
  if (mk === "DC") {
    if (selection.selectionKey === "1X" && home >= away) return "won";
    if (selection.selectionKey === "12" && home !== away) return "won";
    if (selection.selectionKey === "X2" && away >= home) return "won";
    return "lost";
  }

  // Default: lost
  return "lost";
}

/* -------------------------------------------
   POST /create — Admin creates a new match
--------------------------------------------*/
router.post("/create", async (req, res) => {
  try {
    const { home, away, date, time, odds, isLive } = req.body;

    if (!home || !away)
      return res.status(400).json({ error: "Missing team names" });
    if (!odds || typeof odds !== "object")
      return res.status(400).json({ error: "Missing odds object" });

    const newMatch = await Match.create({
      home,
      away,
      date: date || new Date().toISOString().split("T")[0],
      time: time || "00:00",
      odds,
      isLive: !!isLive,
      homeGoals: 0,
      awayGoals: 0,
      result: "0-0",
      status: "open", // open | closed | finished
    });

    return res.json({ message: "✅ Match created successfully", match: newMatch });
  } catch (err) {
    console.error("Match creation error:", err);
    return res.status(500).json({
      error: "Failed to create match",
      details: err.message,
    });
  }
});

/* -------------------------------------------
   GET / — List all matches (sorted by newest)
--------------------------------------------*/
router.get("/", async (req, res) => {
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.json(matches);
  } catch (err) {
    console.error("Fetch matches error:", err);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

/* -------------------------------------------
   PUT /:id — Update any match field
--------------------------------------------*/
router.put("/:id", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const up = req.body;
    Object.assign(match, up);

    // auto-update result string
    match.result = `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}`;
    await match.save();

    return res.json({ message: "✅ Match updated", match });
  } catch (err) {
    console.error("Update match error:", err);
    res.status(500).json({ error: "Failed to update match", details: err.message });
  }
});

/* -------------------------------------------
   PUT /:id/live — Toggle live status
--------------------------------------------*/
router.put("/:id/live", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    if (match.status === "finished")
      return res.status(400).json({ error: "Cannot set live on a finished match" });

    match.isLive = !match.isLive;
    await match.save();

    return res.json({
      message: `Live mode ${match.isLive ? "enabled" : "disabled"}`,
      match,
    });
  } catch (err) {
    console.error("Toggle live error:", err);
    res.status(500).json({ error: "Failed to toggle live", details: err.message });
  }
});

/* -------------------------------------------
   PUT /:id/close — Toggle close/open market
--------------------------------------------*/
router.put("/:id/close", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    match.status = match.status === "closed" ? "open" : "closed";
    await match.save();

    return res.json({
      message: `Market is now ${match.status.toUpperCase()}`,
      match,
    });
  } catch (err) {
    console.error("Toggle close error:", err);
    res.status(500).json({ error: "Failed to toggle close", details: err.message });
  }
});

/* -------------------------------------------
   PUT /:id/goals — Live goal updates + eval
--------------------------------------------*/
router.put("/:id/goals", async (req, res) => {
  try {
    const { homeGoals, awayGoals } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    match.homeGoals = Number(homeGoals);
    match.awayGoals = Number(awayGoals);
    match.result = `${match.homeGoals}-${match.awayGoals}`;
    await match.save();

    return res.json({
      message: "⚽ Goals updated",
      match,
    });
  } catch (err) {
    console.error("Goal update error:", err);
    res.status(500).json({ error: "Goal update failed", details: err.message });
  }
});

/* -------------------------------------------
   ✅ FIXED: PUT /:id/finish — Mark match as finished (NO PAYOUTS)
--------------------------------------------*/
router.put("/:id/finish", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    if (match.homeGoals === undefined || match.awayGoals === undefined)
      return res.status(400).json({ error: "Cannot finish match without goals" });

    match.status = "finished";
    match.isLive = false;
    await match.save();

    // ✅ ONLY update selection results, NO PAYOUTS until all matches finish
    const bets = await Bet.find({ 
      "selections.matchId": match._id,
      status: "pending" // Only update pending bets
    });

    for (const bet of bets) {
      // Update only the selections for this finished match
      for (const selection of bet.selections) {
        if (selection.matchId.toString() === match._id.toString()) {
          selection.result = evaluateSelection(selection, match.homeGoals, match.awayGoals);
        }
      }
      
      // ✅ Check if bet should be immediately lost (any selection lost)
      const anyLost = bet.selections.some(s => s.result === "lost");
      if (anyLost) {
        bet.status = "lost";
        console.log(`💔 Bet ${bet._id} lost immediately - selection lost in match ${match._id}`);
      }
      // ✅ Otherwise, keep as pending (wait for other matches)
      
      await bet.save();
    }

    return res.json({
      message: "✅ Match finished - selections updated (NO PAYOUTS until all matches finish)",
      match,
    });
  } catch (err) {
    console.error("Finish error:", err);
    res.status(500).json({ error: "Failed to finish match", details: err.message });
  }
});

/* -------------------------------------------
   ✅ NEW: PUT /:id/settle — Manually settle all bets for this match
--------------------------------------------*/
router.put("/:id/settle", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    // Trigger bet settlement through the bets route
    const settlementRes = await fetch(`http://localhost:5000/bets/check/${match._id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    let settlementMessage = "";
    if (settlementRes.ok) {
      const settlementData = await settlementRes.json();
      settlementMessage = ` - ${settlementData.message}`;
    }

    return res.json({
      message: "✅ Match settlement triggered" + settlementMessage,
      match,
    });
  } catch (err) {
    console.error("Settle error:", err);
    res.status(500).json({ error: "Failed to settle match", details: err.message });
  }
});

/* -------------------------------------------
   DELETE /:id — Delete match (soft delete)
--------------------------------------------*/
router.delete("/:id", async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    // Check if there are any bets placed on this match
    const existingBets = await Bet.find({ "selections.matchId": req.params.id });
    
    if (existingBets.length > 0) {
      // Soft delete - just mark as deleted but keep in database
      match.status = "deleted";
      await match.save();
      return res.json({ message: "✅ Match marked as deleted (bets exist)", match });
    } else {
      // Hard delete - no bets placed, can remove completely
      await Match.findByIdAndDelete(req.params.id);
      return res.json({ message: "✅ Match deleted completely", match });
    }
  } catch (err) {
    console.error("Delete match error:", err);
    res.status(500).json({ error: "Failed to delete match", details: err.message });
  }
});

module.exports = router;