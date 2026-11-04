import mongoose from "mongoose";
import { CaseRecord, Notification, User } from "../models.js";
import { enqueueEmail } from "../services/emailOutbox.js";
import { config } from "../config.js";

interface DeliveryEvent {
  _id: mongoose.Types.ObjectId; kind: string; actorId?: mongoose.Types.ObjectId; internal: boolean;
  requesterId: mongoose.Types.ObjectId; assigneeId?: mongoose.Types.ObjectId; team: string; status: string;
}

export async function processCaseDeliveries() {
  const now = new Date();
  const pending = { completedAt: null, attempts: { $lt: 10 }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] };
  for (let batch = 0; batch < 20; batch++) {
    const record = await CaseRecord.findOne({ deliveryEvents: { $elemMatch: pending } },
      { organizationId: 1, code: 1, deliveryEvents: { $elemMatch: pending } }).lean<{ _id: mongoose.Types.ObjectId; organizationId: mongoose.Types.ObjectId; code: string; deliveryEvents: DeliveryEvent[] }>();
    if (!record) return;
    const event = record.deliveryEvents?.[0];
    if (!event) continue;
    const claimed = await CaseRecord.updateOne({ _id: record._id, deliveryEvents: { $elemMatch: { ...pending, _id: event._id } } },
      { $set: { "deliveryEvents.$.lockedUntil": new Date(Date.now() + 120000) }, $inc: { "deliveryEvents.$.attempts": 1 } }, { timestamps: false });
    if (!claimed.modifiedCount) continue;
    try {
      const recipientIds = new Set<string>();
      if (!event.internal && event.requesterId) recipientIds.add(String(event.requesterId));
      if (event.assigneeId) recipientIds.add(String(event.assigneeId));
      if (!event.assigneeId || event.kind === "created") {
        const staff = await User.find({ organizationId: record.organizationId, active: true,
          $or: [{ role: "agent", team: event.team }, { role: { $in: ["manager", "org_admin", "platform_admin"] } }] }).select("_id").lean();
        for (const user of staff) recipientIds.add(String(user._id));
      }
      recipientIds.delete(String(event.actorId));
      const users = await User.find({ organizationId: record.organizationId, active: true, _id: { $in: [...recipientIds] } }).select("_id email").lean();
      for (const user of users) {
        const type = event.kind === "commented" ? "case_commented" : event.kind === "assigned" && String(user._id) === String(event.assigneeId) ? "case_assigned" : "case_updated";
        const deliveryKey = `${record.organizationId}:${event._id}:${user._id}:${type}`;
        await Notification.updateOne({ deliveryKey }, { $setOnInsert: { deliveryKey, organizationId: record.organizationId,
          userId: user._id, type, title: `Hồ sơ ${record.code} có cập nhật`, message: "Đăng nhập để xem thông tin mới nhất.",
          relatedCaseId: record._id, actionUrl: `/cases/${record._id}` } }, { upsert: true });
        if (!event.internal && String(user._id) === String(event.requesterId)) {
          const url = new URL(`/cases/${record._id}`, config.WEB_ORIGIN).toString();
          await enqueueEmail({ to: user.email, subject: `[CaseFlow] Hồ sơ ${record.code} có cập nhật`,
            html: "<p>Hồ sơ của bạn có cập nhật. Vui lòng đăng nhập CaseFlow để xem chi tiết.</p>",
            text: `Hồ sơ ${record.code} có cập nhật: ${url}` }, `${record._id}:${event._id}:requester`);
        }
      }
      await CaseRecord.updateOne({ _id: record._id, "deliveryEvents._id": event._id },
        { $set: { "deliveryEvents.$.completedAt": new Date(), "deliveryEvents.$.lockedUntil": null } }, { timestamps: false });
    } catch {
      console.warn("[Case delivery] Retained event for retry; sensitive payload omitted.");
    }
  }
}
