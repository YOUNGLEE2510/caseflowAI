import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const attachmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    caseId: { type: Schema.Types.ObjectId, ref: "CaseRecord", required: true, index: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploaderName: { type: String, required: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    internal: { type: Boolean, default: false },
    storagePath: { type: String },
    storageProvider: { type: String, enum: ["local", "s3", "cloudinary"], default: "local" },
    objectKey: { type: String },
    uploadFingerprint: { type: String, select: false },
    scanStatus: { type: String, enum: ["clean", "not_scanned"], default: "not_scanned" },
    scannedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deleting: { type: Boolean, default: false },
    deletionLease: { type: String, select: false },
    deletionLeaseUntil: { type: Date, select: false }
  },
  { timestamps: true }
);

export const Attachment = models.Attachment || model("Attachment", attachmentSchema);
