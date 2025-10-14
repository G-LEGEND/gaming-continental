// routes/bets.js
const express = require("express");
const router = express.Router();
const Bet = require("../models/Bet");
const User = require("../models/User");
const Match = require("../models/Match");

/**
 * ✅ FIXED: Proper combined odds calculation (MULTIPLY all odds)
 */
function calcCombinedOdd(selections) {
  if (!Array.isArray(selections) || selections.length === 0) return 0;
  let total = 1;
  selections.forEach(s => {
    total *= Number(s.odd) || 1;
  });
  return Number(total.toFixed(2));
}

// ✅ SIMPLE: Check if selection won
function checkSelectionResult(selection, match) {
  const { marketKey, selectionKey } = selection;
  
  const homeGoals = match.homeGoals || 0;
  const awayGoals = match.awayGoals || 0;
  const totalGoals = homeGoals + awayGoals;

  // 1X2 Market
  if (marketKey === "1X2") {
    if (selectionKey === "home") return homeGoals > awayGoals ? "won" : "lost";
    if (selectionKey === "away") return awayGoals > homeGoals ? "won" : "lost";
    if (selectionKey === "draw") return homeGoals === awayGoals ? "won" : "lost";
  }
  
  // GG/NG Market
  if (marketKey === "GG") {
    if (selectionKey === "yes") return (homeGoals > 0 && awayGoals > 0) ? "won" : "lost";
    if (selectionKey === "no") return (homeGoals === 0 || awayGoals === 0) ? "won" : "lost";
  }
  
  // Over/Under Market
  if (marketKey === "OU") {
    const line = parseFloat(selectionKey.split('_')[1]);
    if (selectionKey.startsWith("over")) return totalGoals > line ? "won" : "lost";
    if (selectionKey.startsWith("under")) return totalGoals < line ? "won" : "lost";
  }
  
  return "lost";
}

// ✅ FINAL PERFECT: PROFESSIONAL BETTING RULES
async function settleBet(betId) {
  try {
    const bet = await Bet.findById(betId).populate("userId");
    if (!bet || bet.status !== "pending") return;

    console.log(`🎯 Checking bet ${betId} with ${bet.selections.length} selections`);

    let allSelectionsFinished = true;
    let anySelectionLost = false;
    let allSelectionsWon = true;

    // Check ALL selections
    for (let i = 0; i < bet.selections.length; i++) {
      const selection = bet.selections[i];
      const match = await Match.findById(selection.matchId);
      
      if (!match) {
        // Match not found = immediate LOSE
        selection.result = "lost";
        anySelectionLost = true;
        allSelectionsWon = false;
        console.log(`❌ Match not found: ${selection.matchId}`);
        continue;
      }
      
      // Check if match is finished
      if (match.status !== "finished") {
        // Match still pending/not started
        selection.result = "pending";
        allSelectionsFinished = false;
        console.log(`⏳ Match pending: ${match.home} vs ${match.away} (${match.status})`);
      } else {
        // Match finished - check result
        const result = checkSelectionResult(selection, match);
        selection.result = result;
        console.log(`📋 ${match.home} vs ${match.away}: ${selection.label} = ${result}`);
        
        if (result === "lost") {
          anySelectionLost = true;
          allSelectionsWon = false;
        }
      }
    }

    // ✅ PROFESSIONAL BETTING RULES:
    if (anySelectionLost) {
      // ❌ ANY SELECTION LOST = IMMEDIATE LOSE (NO PAYMENT)
      bet.status = "lost";
      console.log(`💔 Bet ${betId} LOST immediately - at least one selection lost`);
    } else if (!allSelectionsFinished) {
      // ⏳ STILL WAITING FOR MATCHES (SOME NOT STARTED/FINISHED)
      bet.status = "pending";
      console.log(`⏳ Bet ${betId} pending - waiting for ${bet.selections.length} matches to finish`);
    } else if (allSelectionsWon) {
      // ✅ ALL SELECTIONS FINISHED AND ALL WON = PAY ONCE
      bet.status = "won";
      console.log(`🎉 Bet ${betId} WON - ALL ${bet.selections.length} selections won`);
      
      if (!bet.isPaid) {
        const winAmount = bet.potentialWin;
        bet.userId.balance = Number(bet.userId.balance) + Number(winAmount);
        await bet.userId.save();
        bet.isPaid = true;
        console.log(`💰 Paid ₦${winAmount} for bet ${bet._id}`);
      }
    } else {
      // This should not happen, but safety net
      bet.status = "lost";
      console.log(`❓ Bet ${betId} set to LOST (fallback)`);
    }

    await bet.save();
    console.log(`✅ Bet ${betId} updated: ${bet.status}`);
    return bet;
    
  } catch (err) {
    console.error("Settle bet error:", err);
  }
}

// ✅ PLACE BET ROUTE
router.post("/place", async (req, res) => {
  try {
    const { userId, selections, stake } = req.body;
    if (!userId || !Array.isArray(selections) || selections.length === 0 || !stake) {
      return res.status(400).json({ error: "Invalid bet data" });
    }

    // Validate selections
    for (const s of selections) {
      if (!s.matchId || !s.marketKey || !s.selectionKey || !s.odd) {
        return res.status(400).json({ error: "Invalid selection format" });
      }
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (Number(user.balance || 0) < Number(stake)) return res.status(400).json({ error: "Insufficient balance" });

    const combinedOdd = calcCombinedOdd(selections);
    const potentialWin = Number((combinedOdd * Number(stake)).toFixed(2));

    // Deduct stake immediately
    user.balance = Number(user.balance) - Number(stake);
    await user.save();

    // Save bet
    const bet = await Bet.create({
      userId,
      selections,
      stake,
      combinedOdd,
      potentialWin,
      status: "pending",
      isPaid: false
    });

    return res.json({ message: "Bet placed", bet, balance: user.balance });
  } catch (err) {
    console.error("Bet placement error:", err);
    return res.status(500).json({ error: "Failed to place bet", details: err.message });
  }
});

// ✅ CHECK BETS WHEN MATCH FINISHES
router.post("/check/:matchId", async (req, res) => {
  try {
    const matchId = req.params.matchId;
    
    console.log(`🔍 Checking bets for finished match ${matchId}`);
    
    // Find all pending bets with this match
    const pendingBets = await Bet.find({
      status: "pending",
      "selections.matchId": matchId
    }).populate("userId");
    
    console.log(`📊 Found ${pendingBets.length} pending bets with this match`);
    
    // Update each bet
    const updatedBets = [];
    for (const bet of pendingBets) {
      const updatedBet = await settleBet(bet._id);
      if (updatedBet) updatedBets.push(updatedBet);
    }
    
    // Count results
    const won = updatedBets.filter(b => b.status === 'won').length;
    const lost = updatedBets.filter(b => b.status === 'lost').length;
    const pending = updatedBets.filter(b => b.status === 'pending').length;
    
    console.log(`📈 After match ${matchId}: ${won} won, ${lost} lost, ${pending} pending`);
    
    res.json({ 
      message: `Checked ${updatedBets.length} bets`,
      summary: { won, lost, pending },
      updatedBets: updatedBets 
    });
    
  } catch (err) {
    console.error("Check bets error:", err);
    res.status(500).json({ error: "Check failed" });
  }
});

// ✅ MANUAL SETTLE SINGLE BET
router.post("/settle-bet/:betId", async (req, res) => {
  try {
    const bet = await settleBet(req.params.betId);
    
    if (!bet) {
      return res.status(404).json({ error: "Bet not found or already settled" });
    }
    
    res.json({ 
      message: `Bet ${bet.status.toUpperCase()}`, 
      bet: {
        _id: bet._id,
        status: bet.status,
        potentialWin: bet.potentialWin,
        isPaid: bet.isPaid,
        selections: bet.selections.map(s => ({
          label: s.label,
          result: s.result
        }))
      }
    });
    
  } catch (err) {
    console.error("Manual settlement error:", err);
    res.status(500).json({ error: "Manual settlement failed" });
  }
});

// ✅ GET USER BETS
router.get("/user/:id", async (req, res) => {
  try {
    const bets = await Bet.find({ userId: req.params.id }).sort({ createdAt: -1 });
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: "Failed to load bets" });
  }
});

// ✅ GET ALL BETS (ADMIN)
router.get("/all", async (req, res) => {
  try {
    const bets = await Bet.find().populate("userId", "nickname email").sort({ createdAt: -1 });
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: "Failed to load bets" });
  }
});

module.exports = router;