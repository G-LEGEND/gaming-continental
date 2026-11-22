const mongoose = require("mongoose");

const DepositSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  methodId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "PaymentMethod", 
    required: false // ✅ Changed to false so Paystack can use it
  },
  amount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected"], 
    default: "pending" 
  },
  reference: { 
    type: String, 
    default: null // ✅ Added for Paystack references
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model("Deposit", DepositSchema);
