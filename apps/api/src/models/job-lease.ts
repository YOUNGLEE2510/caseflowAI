import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

// A small MongoDB-backed lease prevents a scheduled job from being executed by
// every API instance when the application is horizontally scaled.
const jobLeaseSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    ownerId: { type: String, required: true },
    lockedUntil: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

export const JobLease = models.JobLease || model("JobLease", jobLeaseSchema);
