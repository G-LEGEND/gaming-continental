const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },

    type: { 
      type: String, 
      enum: ["deposit", "withdraw", "bet", "tournament"], 
      required: true 
    },

    amount: { type: Number, required: true },

    // Status: pending until admin approves/rejects
    status: { 
      type: String, 
      enum: ["pending", "approved", "rejected"], 
      default: "pending" 
    },

    // For withdrawals: store bank details snapshot
    bankDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      bankName: { type: String }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);