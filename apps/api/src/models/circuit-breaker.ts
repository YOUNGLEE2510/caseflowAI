import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const circuitBreakerSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    failures: { type: Number, required: true, default: 0, min: 0 },
    lastFailureAt: { type: Date, default: null },
    open: { type: Boolean, required: true, default: false }
  },
  { timestamps: true }
);

export const CircuitBreakerState = models.CircuitBreakerState || model("CircuitBreakerState", circuitBreakerSchema);
