import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    settings: {
      locale: { type: String, default: "vi-VN" },
      timezone: { type: String, default: "Asia/Ho_Chi_Minh" },
      maxFileSizeMB: { type: Number, default: 10 },
      allowedFileTypes: { type: [String], default: [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".xlsx"] }
    }
  },
  { timestamps: true }
);

export const Organization = models.Organization || model("Organization", organizationSchema);
