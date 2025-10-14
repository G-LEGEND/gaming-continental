const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    username: { 
      type: String, 
      required: true, 
      trim: true 
    },
    amount: { 
      type: Number, 
      required: true, 
      min: 1000 
    },
    method: { 
      type: String, 
      required: true, 
      trim: true,
      default: "Bank Transfer"
    },
    // ✅ Store structured bank details instead of string
    accountDetails: {
      firstName: String,
      lastName: String, 
      accountNumber: String,
      bankName: String,
      phoneNumber: String
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    adminNote: String
  },
  { 
    timestamps: true // This automatically creates createdAt, updatedAt
  }
);

// Remove the 'date' field since we have createdAt from timestamps
module.exports = mongoose.model("Withdrawal", WithdrawalSchema);