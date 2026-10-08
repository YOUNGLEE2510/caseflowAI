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
    storagePath: { type: String },
    storageProvider: { type: String, enum: ["local", "s3"], default: "local" },
    objectKey: { type: String },
    scanStatus: { type: String, enum: ["clean", "not_scanned"], default: "not_scanned" },
    scannedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Attachment = models.Attachment || model("Attachment", attachmentSchema);
