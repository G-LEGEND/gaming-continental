const mongoose = require("mongoose");

const BetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  selections: [
    {
      matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
      marketKey: String,
      selectionKey: String,
      odd: Number,
      label: String,
      result: { type: String, enum: ["pending", "won", "lost"], default: "pending" }
    }
  ],
  stake: { type: Number, required: true },
  combinedOdd: { type: Number, required: true },
  potentialWin: { type: Number, required: true },
  status: { type: String, enum: ["pending", "won", "lost"], default: "pending" },

  // ✅ Added: Prevents double payment when admin updates goals multiple times
  isPaid: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Bet", BetSchema);