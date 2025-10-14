const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    // ✅ Basic Info
    nickname: { 
      type: String, 
      required: true, 
      trim: true,
      minlength: 2,
      maxlength: 30
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: { 
      type: String, 
      required: true,
      minlength: 6
    },

    // ✅ Wallet / Balance
    balance: { 
      type: Number, 
      default: 0, 
      min: 0 
    },

    // ✅ Points for each ranking category
    fifaPoints: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    snookerPoints: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    // ✅ Add more game points if needed
    eightBallPoints: { 
      type: Number, 
      default: 0, 
      min: 0 
    },

    // ✅ Role & Account Status
    isAdmin: { 
      type: Boolean, 
      default: false 
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ["active", "banned", "suspended", "inactive"],
      default: "active",
    },

    // ✅ Profile Info
    firstName: { 
      type: String, 
      trim: true,
      maxlength: 50
    },
    lastName: { 
      type: String, 
      trim: true,
      maxlength: 50
    },
    phoneNumber: { 
      type: String, 
      trim: true,
      match: [/^\+?[\d\s\-\(\)]{10,}$/, 'Please enter a valid phone number']
    },
    avatarUrl: { 
      type: String, 
      trim: true,
      default: "/images/default-avatar.png"
    },
    dateOfBirth: {
      type: Date
    },

    // ✅ Bank Details (structured object)
    bankDetails: {
      bankName: { 
        type: String, 
        trim: true 
      },
      accountNumber: { 
        type: String, 
        trim: true 
      },
      accountName: { 
        type: String, 
        trim: true 
      },
      // ✅ Added for Nigerian banks compatibility
      bankCode: {
        type: String,
        trim: true
      }
    },

    // ✅ Gaming Stats
    gamesPlayed: {
      type: Number,
      default: 0
    },
    gamesWon: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    // ✅ Financial Tracking
    totalDeposited: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    totalWithdrawn: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    totalWon: {
      type: Number,
      default: 0,
      min: 0
    },
    totalLost: {
      type: Number,
      default: 0,
      min: 0
    },

    // ✅ Security & Sessions
    lastLogin: {
      type: Date
    },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date
    },

    // ✅ Preferences
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    }
  },
  { 
    timestamps: true 
  }
);

// ✅ Virtual Fields
UserSchema.virtual("fullName").get(function () {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.nickname;
});

UserSchema.virtual("totalPoints").get(function () {
  return (this.fifaPoints || 0) + (this.snookerPoints || 0) + (this.eightBallPoints || 0);
});

UserSchema.virtual("netProfit").get(function () {
  return (this.totalWon || 0) - (this.totalLost || 0);
});

// ✅ Method to check if account is locked
UserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ✅ Method to increment login attempts
UserSchema.methods.incrementLoginAttempts = function() {
  // If previous lock has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Otherwise increment
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock the account if we've reached max attempts and it's not already locked
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + (2 * 60 * 60 * 1000) }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// ✅ Static method to find by email (case insensitive)
UserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: new RegExp('^' + email + '$', 'i') });
};

// ✅ Pre-save middleware to calculate win rate
UserSchema.pre('save', function(next) {
  if (this.gamesPlayed > 0) {
    this.winRate = Math.round((this.gamesWon / this.gamesPlayed) * 100);
  }
  next();
});

// ✅ Include virtuals when converting to JSON
UserSchema.set("toJSON", { 
  virtuals: true,
  transform: function(doc, ret) {
    // Remove password from JSON output
    delete ret.password;
    delete ret.loginAttempts;
    delete ret.lockUntil;
    return ret;
  }
});

UserSchema.set("toObject", { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.password;
    delete ret.loginAttempts;
    delete ret.lockUntil;
    return ret;
  }
});

// ✅ Indexes for better performance
UserSchema.index({ email: 1 });
UserSchema.index({ nickname: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ 'bankDetails.accountNumber': 1 });
UserSchema.index({ totalPoints: -1 });
UserSchema.index({ balance: -1 });

// ✅ Prevent OverwriteModelError
module.exports = mongoose.models.User || mongoose.model("User", UserSchema);