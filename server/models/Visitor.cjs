const mongoose = require('mongoose');
const { Schema } = mongoose;

const VisitorSchema = new Schema(
  {
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    path: {
      type: String,
      default: '/',
    },
    date: {
      type: Date,
      default: Date.now,
      index: true, // 인덱스 추가
    },
  },
  {
    timestamps: true,
  }
);

// 인덱스 추가 (날짜별 조회 최적화)
VisitorSchema.index({ date: 1 });
VisitorSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Visitor', VisitorSchema);

