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
    storagePath: { type: String, required: true }
  },
  { timestamps: true }
);

export const Attachment = models.Attachment || model("Attachment", attachmentSchema);
