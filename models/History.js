const mongoose = require("mongoose");

const historySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  type: { 
    type: String, 
    enum: ["deposit", "withdraw", "tournament_registration", "tournament_win", "tournament_lose", "bonus"], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected", "completed", "won", "lost"], 
    default: "completed" 
  },
  tournamentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tournament"
  },
  tournamentTitle: {
    type: String
  },
  position: {
    type: String
  },
  paymentMethod: {
    type: String
  },
  transactionId: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("History", historySchema);