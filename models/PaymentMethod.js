const mongoose = require("mongoose");

const PaymentMethodSchema = new mongoose.Schema(
  {
    bankName: { 
      type: String, 
      required: true,
      trim: true
    },
    accountNumber: { 
      type: String, 
      required: true,
      unique: true,
      trim: true
    },
    accountName: { 
      type: String, 
      required: true,
      trim: true
    },
    active: { 
      type: Boolean, 
      default: true 
    },
  },
  { 
    timestamps: true 
  }
);

// Add index for better performance
PaymentMethodSchema.index({ active: 1, createdAt: -1 });

module.exports =
  mongoose.models.PaymentMethod ||
  mongoose.model("PaymentMethod", PaymentMethodSchema);