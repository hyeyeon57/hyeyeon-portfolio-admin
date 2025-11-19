const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProjectSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    fullDescription: {
      type: String,
    },
    image: {
      type: String,
    },
    tags: [{
      type: String,
    }],
    category: {
      type: String,
      required: true,
      enum: ['new', 'renewal', 'app', 'web', 'proposal', 'usability'],
    },
    date: {
      type: String,
    },
    role: {
      type: String,
    },
    duration: {
      type: String,
    },
    team: {
      type: String,
    },
    achievements: [{
      type: String,
    }],
    link: {
      type: String,
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Project', ProjectSchema);

