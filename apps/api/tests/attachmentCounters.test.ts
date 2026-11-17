import { Types } from "mongoose";
import { beforeEach, expect, it, vi } from "vitest";

// Minimal in-memory stand-ins that honour the version guard used by the reconciliation write.
const caseId = new Types.ObjectId();
const fileA = new Types.ObjectId();
const fileB = new Types.ObjectId();
let record: any;
let attachments: Array<{ _id: Types.ObjectId; size: number; deletedAt: Date | null }>;
let onAttachmentRead: (() => void) | undefined;
const chain = (value: () => unknown) => ({ select: () => ({ lean: async () => value() }) });

vi.mock("../src/models.js", () => ({
  CaseRecord: {
    findOne: (filter: any) => chain(() => record.attachmentCountersReconciled && filter.attachmentCountersReconciled ? null : ({ ...record, events: [...record.events], attachmentReservations: [...record.attachmentReservations] })),
    updateOne: async (filter: any, update: any) => {
      if (filter.__v !== record.__v || record.attachmentCountersReconciled) return { modifiedCount: 0 };
      Object.assign(record, update.$set); record.__v += update.$inc.__v;
      return { modifiedCount: 1 };
    }
  },
  Attachment: {
    find: () => chain(() => { const rows = attachments.filter(file => !file.deletedAt).map(file => ({ ...file })); onAttachmentRead?.(); onAttachmentRead = undefined; return rows; })
  }
}));
vi.mock("../src/services/objectStorage.js", () => ({ deleteObject: vi.fn() }));
vi.mock("../src/services/jobLease.js", () => ({ acquireJobLease: vi.fn(), releaseJobLease: vi.fn() }));

const { reconcileLegacyAttachmentCounters } = await import("../src/services/attachmentUploads.js");

beforeEach(() => {
  record = { __v: 3, attachmentCount: 0, attachmentBytes: 0, events: [], attachmentReservations: [] };
  attachments = [{ _id: fileA, size: 100, deletedAt: null }, { _id: fileB, size: 50, deletedAt: null }];
});

it("rebuilds counters for a legacy case once", async () => {
  expect(await reconcileLegacyAttachmentCounters(caseId)).toBe(true);
  expect(record).toMatchObject({ attachmentCount: 2, attachmentBytes: 150, attachmentCountersReconciled: true });
  record.attachmentCount = 7; // later counter changes are owned by the $inc/$subtract paths
  expect(await reconcileLegacyAttachmentCounters(caseId)).toBe(true);
  expect(record.attachmentCount).toBe(7);
});

it("does not restore a deletion that finishes between the read and the write", async () => {
  onAttachmentRead = () => {
    // Concurrent DELETE: case update (decrement, deletion event, __v bump), then attachment marked deleted.
    record.__v += 1; record.events.push({ _id: fileB, type: "attachment_deleted" });
    attachments.find(file => file._id.equals(fileB))!.deletedAt = new Date();
  };
  expect(await reconcileLegacyAttachmentCounters(caseId)).toBe(true);
  expect(record).toMatchObject({ attachmentCount: 1, attachmentBytes: 100 });
});

it("excludes a deletion already counted on the case but not yet marked on the attachment", async () => {
  record.events.push({ _id: fileB, type: "attachment_deleted" });
  expect(await reconcileLegacyAttachmentCounters(caseId)).toBe(true);
  expect(record).toMatchObject({ attachmentCount: 1, attachmentBytes: 100 });
});

it("counts an in-flight upload once whether or not its attachment is committed", async () => {
  const pending = new Types.ObjectId();
  record.attachmentReservations.push({ _id: pending, size: 25 });
  attachments.push({ _id: pending, size: 25, deletedAt: null });
  expect(await reconcileLegacyAttachmentCounters(caseId)).toBe(true);
  expect(record).toMatchObject({ attachmentCount: 3, attachmentBytes: 175 });
});
