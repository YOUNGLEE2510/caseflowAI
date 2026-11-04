import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ upload: vi.fn(), destroy: vi.fn(), download: vi.fn() }));
vi.mock("cloudinary", () => ({ v2: { uploader: { upload_stream: sdk.upload, destroy: sdk.destroy }, utils: { private_download_url: sdk.download } } }));
vi.mock("../src/config.js", () => ({ config: { CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret" } }));
import { storeCloudinaryObject, deleteCloudinaryObject, getCloudinaryObjectStream } from "../src/services/cloudinaryStorage.js";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("stores original bytes only as authenticated raw assets without overwrite", async () => {
  let received = Buffer.alloc(0);
  sdk.upload.mockImplementation((options, callback) => new Writable({
    write(chunk, _encoding, done) { received = Buffer.concat([received, chunk]); done(); },
    final(done) { callback(null, { public_id: options.public_id, type: options.type, resource_type: options.resource_type }); done(); }
  }));
  await storeCloudinaryObject("org/case/unique.pdf", Buffer.from("test"));
  expect(received.toString()).toBe("test");
  expect(sdk.upload.mock.calls[0][0]).toMatchObject({ resource_type: "raw", type: "authenticated", overwrite: false });
});

it("does not accept a public upload result", async () => {
  sdk.upload.mockImplementation((_options, callback) => new Writable({ write(_chunk, _encoding, done) { done(); }, final(done) { callback(null, { public_id: "key", type: "upload", resource_type: "raw" }); done(); } }));
  await expect(storeCloudinaryObject("key", Buffer.from("test"))).rejects.toMatchObject({ status: 503 });
});

it("downloads using an expiring authenticated URL without exposing it to the caller", async () => {
  sdk.download.mockReturnValue("https://api.cloudinary.com/private-test");
  const fetchMock = vi.fn().mockResolvedValue(new Response("private bytes"));
  vi.stubGlobal("fetch", fetchMock);
  const stream = await getCloudinaryObjectStream("org/case/id.pdf");
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("private bytes");
  expect(sdk.download.mock.calls[0][2]).toMatchObject({ type: "authenticated", resource_type: "raw" });
  expect(sdk.download.mock.calls[0][2].expires_at).toBeGreaterThan(Date.now() / 1000);
  expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
});

it("deletes authenticated raw assets and treats missing assets as already deleted", async () => {
  sdk.destroy.mockResolvedValue({ result: "not found" });
  await expect(deleteCloudinaryObject("org/case/id.pdf")).resolves.toBeUndefined();
  expect(sdk.destroy.mock.calls[0][1]).toMatchObject({ type: "authenticated", resource_type: "raw", invalidate: true });
});
