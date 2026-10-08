import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/config.js", () => ({ config: {
  STORAGE_PROVIDER: "s3", S3_BUCKET: "test-bucket", S3_ENDPOINT: "http://storage.invalid",
  S3_REGION: "us-east-1", S3_ACCESS_KEY: "test-only", S3_SECRET_KEY: "test-only"
} }));
vi.mock("@aws-sdk/client-s3", async (original) => {
  const sdk = await original<typeof import("@aws-sdk/client-s3")>();
  return { ...sdk, S3Client: class { send = send; } };
});
const { initializeObjectStorage, storeObject, deleteObject, getObjectStream } = await import("../src/services/objectStorage.js");
beforeEach(() => { send.mockReset(); });

it("uses an existing bucket without creating or making it public", async () => {
  send.mockResolvedValue({});
  await initializeObjectStorage();
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0].constructor.name).toBe("HeadBucketCommand");
});
it("handles a concurrent bucket creation by verifying access", async () => {
  send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
    .mockRejectedValueOnce({ $metadata: { httpStatusCode: 409 } })
    .mockResolvedValueOnce({});
  await initializeObjectStorage();
  expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(["HeadBucketCommand", "CreateBucketCommand", "HeadBucketCommand"]);
});
it("does not mask permission failures when initializing", async () => {
  const denied = Object.assign(new Error("Access denied"), { $metadata: { httpStatusCode: 403 } });
  send.mockRejectedValue(denied);
  await expect(initializeObjectStorage()).rejects.toThrow("Access denied");
  expect(send).toHaveBeenCalledOnce();
});
it("stores and removes objects without a public ACL", async () => {
  send.mockResolvedValue({});
  await storeObject("org/case/uuid.pdf", Buffer.from("content"), "application/pdf");
  expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: "test-bucket", Key: "org/case/uuid.pdf", ContentType: "application/pdf" });
  expect(send.mock.calls[0][0].input).not.toHaveProperty("ACL");
  await deleteObject("org/case/uuid.pdf");
  expect(send.mock.calls[1][0].constructor.name).toBe("DeleteObjectCommand");
});
it("streams downloads and distinguishes missing objects from outages", async () => {
  const stream = Readable.from([Buffer.from("content")]);
  send.mockResolvedValueOnce({ Body: stream });
  expect(await getObjectStream("org/case/uuid.pdf")).toBe(stream);
  send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
  await expect(getObjectStream("missing")).rejects.toMatchObject({ status: 404 });
  send.mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(getObjectStream("existing")).rejects.toMatchObject({ status: 503 });
});
