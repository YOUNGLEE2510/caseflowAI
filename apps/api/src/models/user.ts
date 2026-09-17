import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { USER_ROLES } from "./constants.js";

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    team: { type: String, default: "" },
    title: { type: String, default: "" },
    avatarColor: { type: String, default: "#155c4d" },
    phone: { type: String, default: "" },
    skills: [{ type: String }],
    maxCaseload: { type: Number, default: 15 },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }
  },
  { timestamps: true }
);
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, role: 1, team: 1, active: 1 });

export const User = models.User || model("User", userSchema);
