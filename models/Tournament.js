const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    image: { type: String, required: true },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    description: { type: String, required: true },
    maxPlayers: { type: Number, required: true },
    registeredPlayers: { type: Number, default: 0 },
    
    // ✅ NEW: Tournament status
    status: { 
      type: String, 
      enum: ["open", "closed", "deleted"], 
      default: "open" 
    },

    // Track each registration
    players: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        amount: { type: Number, required: true },
        status: { type: String, enum: ["pending", "win", "lose"], default: "pending" },
        position: { type: String }, // e.g. "1st", "2nd", "3rd"
        prize: { type: Number, default: 0 }, // amount awarded if win
        registeredAt: { type: Date, default: Date.now } // ✅ NEW: registration date
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tournament", TournamentSchema);