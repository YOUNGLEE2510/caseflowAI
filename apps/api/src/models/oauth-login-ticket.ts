import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const oauthLoginTicketSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    remember: { type: Boolean, default: true },
    provider: { type: String, enum: ["google", "microsoft"], default: "google" },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

oauthLoginTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthLoginTicket = models.OAuthLoginTicket || model("OAuthLoginTicket", oauthLoginTicketSchema);
