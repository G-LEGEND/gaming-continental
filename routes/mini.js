const express = require("express");
const router = express.Router();
const MiniRoom = require("../models/MiniRoom");
const User = require("../models/User");

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const BOT_ODDS = {
  1: 1.2, 2: 2.0, 3: 3.0, 4: 5.0,
  5: 7.0, 6: 9.0, 7: 12.0, 8: 15.0,
  9: 20.0, 10: 25.0
};

// ✅ Dynamic kill target: timeLimit minutes × 10 kills
function requiredKills(timeLimit) {
  return Number(timeLimit) * 10;
}

// 1. CREATE ROOM
router.post("/create", async (req, res) => {
  try {
    const { userId, mode, teamSize, stake, timeLimit, mapId } = req.body;

    if (!userId || !mode || !stake || !timeLimit) return res.status(400).json({ error: "Missing fields" });
    if (stake < 100 || stake > 10000) return res.status(400).json({ error: "Stake must be ₦100 - ₦10,000" });
    if (timeLimit < 1 || timeLimit > 10) return res.status(400).json({ error: "Time must be 1-10 minutes" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < stake) return res.status(400).json({ error: "Insufficient balance" });

    user.balance -= stake;
    await user.save();

    const roomCode = generateCode();
    const room = await MiniRoom.create({
      roomCode, hostId: userId, mode, teamSize, stake, timeLimit,
      mapId: mapId === 0 ? (Math.floor(Math.random() * 5) + 1) : Math.min(5, Math.max(1, Number(mapId) || 1)),
      totalPot: stake,
      odds: mode === "solo_vs_bot" ? (BOT_ODDS[timeLimit] || 1.2) : 1,
      players: [{ userId: user._id, username: user.nickname, team: 1, isBot: false }]
    });

    res.json({ message: "Room created", room, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 2. JOIN ROOM
router.post("/join", async (req, res) => {
  try {
    const { userId, roomCode } = req.body;
    const user = await User.findById(userId);
    const room = await MiniRoom.findOne({ roomCode, status: "waiting" });

    if (!room) return res.status(404).json({ error: "Room not found or already started" });
    if (room.mode === "solo_vs_bot") return res.status(400).json({ error: "Cannot join a solo bot game" });
    if (user.balance < room.stake) return res.status(400).json({ error: "Insufficient balance" });

    const maxPlayers = room.teamSize === 0 ? 14 : (room.teamSize * 2);
    if (room.players.length >= maxPlayers) return res.status(400).json({ error: "Room is full" });

    user.balance -= room.stake;
    await user.save();

    let assignedTeam = 1;
    if (room.teamSize > 0) {
      const t1 = room.players.filter(p => p.team === 1).length;
      const t2 = room.players.filter(p => p.team === 2).length;
      assignedTeam = t1 <= t2 ? 1 : 2;
    }

    room.players.push({ userId: user._id, username: user.nickname, team: assignedTeam, isBot: false });
    room.totalPot += room.stake;
    await room.save();

    res.json({ message: "Joined room", room, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 3. START GAME — stamps the authoritative clock
router.post("/start/:roomCode", async (req, res) => {
  try {
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.status !== "waiting") return res.status(400).json({ error: "Game already started or ended" });

    if (room.mode === "solo_vs_bot") {
      const botCount = 14;
      for (let i = 0; i < botCount; i++) {
        room.players.push({ username: `Bot_${i+1}`, team: 2, isBot: true });
      }
    }

    const now = new Date();
    room.status = "active";
    room.startedAt = now;
    room.endsAt = new Date(now.getTime() + room.timeLimit * 60 * 1000);
    room.settled = false;
    await room.save();

    res.json({ message: "Game started", room });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 4. GET ROOM
router.get("/room/:roomCode", async (req, res) => {
  try {
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ room });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 5. END GAME — server-authoritative, atomic, dynamic kills rule
router.post("/end/:roomCode", async (req, res) => {
  try {
    const { roomCode } = req.params;

    const room = await MiniRoom.findOneAndUpdate(
      { roomCode, status: "active", settled: false },
      { settled: true },
      { new: true }
    );
    if (!room) return res.status(400).json({ error: "Game already settled or not active" });

    const houseFee = room.totalPot * 0.10;
    const prizePool = room.totalPot - houseFee;
    let payouts = [];
    let won = false;

    if (room.mode === "solo_vs_bot") {
      const player = room.players.find(p => !p.isBot);
      if (!player) {
        room.status = "finished";
        await room.save();
        return res.json({ message: "No player", payouts: [] });
      }

      const timeUp = room.endsAt && Date.now() >= new Date(room.endsAt).getTime();
      const killsRequired = requiredKills(room.timeLimit);
      won = timeUp && player.isAlive && player.kills >= killsRequired;

      if (won) {
        const winAmount = Number(room.stake) * Number(room.odds);
        await User.findByIdAndUpdate(player.userId, { $inc: { balance: winAmount } });
        payouts.push({
          userId: player.userId,
          amount: winAmount,
          position: `Survived with ${player.kills}/${killsRequired} kills`
        });
        room.winningTeam = 1;
      } else {
        room.winningTeam = 2;
      }
    } else if (room.mode === "pvp" && room.teamSize > 1) {
      const { winningTeam } = req.body;
      room.winningTeam = winningTeam;
      const winners = room.players.filter(p => p.team === winningTeam);
      const split = prizePool / (winners.length || 1);
      for (const w of winners) {
        if (w.isBot || !w.userId) continue;
        await User.findByIdAndUpdate(w.userId, { $inc: { balance: split } });
        payouts.push({ userId: w.userId, amount: split });
      }
    } else if (room.mode === "pvp" && room.teamSize === 0) {
      const { ffaFirst, ffaSecond } = req.body;
      const firstPrize = prizePool * (60/90);
      const secondPrize = prizePool * (30/90);
      const first = room.players.find(p => p.username === ffaFirst);
      const second = room.players.find(p => p.username === ffaSecond);
      if (first && !first.isBot && first.userId) {
        await User.findByIdAndUpdate(first.userId, { $inc: { balance: firstPrize } });
        payouts.push({ userId: first.userId, amount: firstPrize, position: "1st" });
      }
      if (second && !second.isBot && second.userId) {
        await User.findByIdAndUpdate(second.userId, { $inc: { balance: secondPrize } });
        payouts.push({ userId: second.userId, amount: secondPrize, position: "2nd" });
      }
    }

    room.status = "finished";
    await room.save();
    res.json({
      message: "Game settled",
      won,
      houseFee,
      prizePool,
      payouts,
      kills: room.players.find(p => !p.isBot)?.kills,
      killsRequired: requiredKills(room.timeLimit)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 6. CANCEL
router.post("/cancel/:roomCode", async (req, res) => {
  try {
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode, status: "waiting" });
    if (!room) return res.status(404).json({ error: "Room not found or already started" });

    for (const player of room.players) {
      if (!player.isBot && player.userId) {
        await User.findByIdAndUpdate(player.userId, { $inc: { balance: room.stake } });
      }
    }
    room.status = "cancelled";
    room.settled = true;
    await room.save();
    res.json({ message: "Room cancelled and all players refunded" });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 7. REPORT A KILL — Option 2 guard (rate-limited, active-only)
router.post("/kill/:roomCode", async (req, res) => {
  try {
    const { killerUsername } = req.body;
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.status !== "active") return res.status(400).json({ error: "Game not active" });
    if (room.endsAt && Date.now() >= new Date(room.endsAt).getTime())
      return res.status(400).json({ error: "Time is up" });

    const killer = room.players.find(p => p.username === killerUsername && !p.isBot);
    if (!killer) return res.status(404).json({ error: "Killer not in room" });
    if (!killer.isAlive) return res.status(400).json({ error: "Killer is dead" });

    const last = killer.lastKillAt ? new Date(killer.lastKillAt).getTime() : 0;
    if (Date.now() - last < 2000)
      return res.status(429).json({ error: "Too fast — suspicious activity" });

    killer.kills += 1;
    killer.lastKillAt = new Date();
    await room.save();
    res.json({
      message: "Kill recorded",
      kills: killer.kills,
      killsRequired: requiredKills(room.timeLimit)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 8. DIE
router.post("/die/:roomCode", async (req, res) => {
  try {
    const { username } = req.body;
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const player = room.players.find(p => p.username === username);
    if (player) player.isAlive = false;
    await room.save();
    res.json({ message: "Player died", player });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 9. RESPAWN
router.post("/respawn/:roomCode", async (req, res) => {
  try {
    const { username } = req.body;
    const room = await MiniRoom.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const player = room.players.find(p => p.username === username);
    if (player) player.isAlive = true;
    await room.save();
    res.json({ message: "Player respawned", player });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
