import { CaseRecord } from "../models.js";
import { caseSearchTokens } from "./caseSearch.js";
import type { Types } from "mongoose";

export async function ensureCaseSearchIndex() {
  await CaseRecord.collection.createIndex({ organizationId: 1, searchTokens: 1 }, { name: "case_search_prefix_org" });
  await CaseRecord.collection.createIndex({ searchVersion: 1 }, { name: "case_search_version" });
  for (let pass = 0; pass < 3; pass++) {
    const cursor = CaseRecord.find({ searchVersion: { $ne: 1 } }).select("code title requesterName updatedAt")
      .lean<Array<{ _id: Types.ObjectId; code: string; title: string; requesterName: string; updatedAt: Date }>>().cursor();
    let batch: Parameters<typeof CaseRecord.bulkWrite>[0] = [];
    for await (const record of cursor) {
      batch.push({ updateOne: { filter: { _id: record._id, updatedAt: record.updatedAt }, update: { $set: {
        searchTokens: caseSearchTokens(record), searchVersion: 1
      } }, timestamps: false } });
      if (batch.length >= 200) { await CaseRecord.bulkWrite(batch); batch = []; }
    }
    if (batch.length) await CaseRecord.bulkWrite(batch);
    if (!await CaseRecord.exists({ searchVersion: { $ne: 1 } })) return;
  }
  throw new Error("Case search backfill could not finish because records kept changing; retry startup in a maintenance window.");
}
