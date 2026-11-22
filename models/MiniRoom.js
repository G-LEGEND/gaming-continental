const mongoose = require("mongoose");

const MiniRoomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  mode: { type: String, enum: ["pvp", "solo_vs_bot"], required: true },
  teamSize: { type: Number, default: 1 },

  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: String,
    team: { type: Number, default: 1 },
    kills: { type: Number, default: 0 },
    isBot: { type: Boolean, default: false },
    isAlive: { type: Boolean, default: true },
    lastKillAt: { type: Date, default: null },
    botWeapon: { type: String, default: null }
  }],

  stake: { type: Number, required: true, min: 100, max: 10000 },
  timeLimit: { type: Number, required: true },
  mapId: { type: Number, default: 1, min: 1, max: 5 },
  odds: { type: Number, default: 1 },
  totalPot: { type: Number, required: true },

  status: { type: String, enum: ["waiting", "active", "finished", "cancelled"], default: "waiting" },
  winningTeam: { type: Number, default: null },

  startedAt: { type: Date, default: null },
  endsAt:    { type: Date, default: null },
  settled:   { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("MiniRoom", MiniRoomSchema);
