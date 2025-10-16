const mongoose = require('mongoose');

const liveStreamSchema = new mongoose.Schema({
  tournament: {
    type: String,
    required: true,
    trim: true
  },
  link: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: 'Watch this exciting live gaming tournament'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String, // CHANGED: Store email as string
    required: true
  }
}, {
  timestamps: true
});

// Add index for better performance
liveStreamSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('LiveStream', liveStreamSchema);