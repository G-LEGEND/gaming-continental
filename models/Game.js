const mongoose = require("mongoose");

const GameSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  words: [{ type: String }],
  currentIndex: { type: Number, default: 0 },
  stake: { type: Number, required: true },
  odds: { type: Number, required: true },
  status: { type: String, enum: ["active", "won", "lost"], default: "active" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Game", GameSchema);
