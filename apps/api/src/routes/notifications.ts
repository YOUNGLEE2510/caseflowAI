import { Router } from "express";
import { Notification } from "../models.js";

export const notificationRouter = Router();

/* Lấy danh sách thông báo của user hiện tại */
notificationRouter.get("/", async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const filter: Record<string, unknown> = {
    organizationId: req.auth!.organizationId,
    userId: req.auth!.id
  };
  if (req.query.unread === "true") filter.read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ organizationId: req.auth!.organizationId, userId: req.auth!.id }),
    Notification.countDocuments({ organizationId: req.auth!.organizationId, userId: req.auth!.id, read: false })
  ]);

  res.json({ notifications, total, unreadCount });
});

/* Đếm thông báo chưa đọc */
notificationRouter.get("/unread-count", async (req, res) => {
  const count = await Notification.countDocuments({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.id,
    read: false
  });
  res.json({ count });
});

/* Đánh dấu đã đọc 1 thông báo */
notificationRouter.patch("/:id/read", async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.auth!.organizationId, userId: req.auth!.id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!notification) {
    res.status(404).json({ message: "Không tìm thấy thông báo." });
    return;
  }
  res.json({ notification });
});

/* Đánh dấu tất cả đã đọc */
notificationRouter.post("/read-all", async (req, res) => {
  const result = await Notification.updateMany(
    { organizationId: req.auth!.organizationId, userId: req.auth!.id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ updated: result.modifiedCount });
});

/* Xóa thông báo cũ (>30 ngày) */
notificationRouter.delete("/cleanup", async (req, res) => {
  const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000);
  const result = await Notification.deleteMany({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.id,
    read: true,
    createdAt: { $lt: cutoff }
  });
  res.json({ deleted: result.deletedCount });
});
