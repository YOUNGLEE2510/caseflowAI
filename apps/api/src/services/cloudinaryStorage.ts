import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";

const credentials = { cloud_name: config.CLOUDINARY_CLOUD_NAME, api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET, secure: true };

function requireCredentials() {
  if (!credentials.cloud_name || !credentials.api_key || !credentials.api_secret) throw new HttpError(503, "Kho lưu trữ tệp chưa được cấu hình.");
}

export async function storeCloudinaryObject(key: string, body: Buffer) {
  requireCredentials();
  try {
    await new Promise<void>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream({ ...credentials, resource_type: "raw", type: "authenticated",
        public_id: key, overwrite: false, unique_filename: false, timeout: 60000 }, (error, result) => {
        if (error || !result || result.public_id !== key || result.type !== "authenticated" || result.resource_type !== "raw") reject(new Error("Private upload failed"));
        else resolve();
      });
      upload.on("error", reject);
      upload.end(body);
    });
  } catch { throw new HttpError(503, "Chưa thể lưu tệp. Vui lòng thử lại."); }
}

export async function deleteCloudinaryObject(key: string) {
  requireCredentials();
  try {
    const options = { ...credentials, resource_type: "raw" as const, type: "authenticated" as const, invalidate: true, timeout: 30000 };
    const result = await cloudinary.uploader.destroy(key, options);
    if (!["ok", "not found"].includes(result.result)) throw new Error("Deletion failed");
  } catch { throw new HttpError(503, "Chưa thể xóa tệp trên kho lưu trữ."); }
}

export async function getCloudinaryObjectStream(key: string) {
  requireCredentials();
  const url = cloudinary.utils.private_download_url(key, "", { ...credentials, resource_type: "raw", type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 60, attachment: true });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "error" });
    if (response.status === 404) throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
    if (!response.ok || !response.body) throw new Error("Download unavailable");
    return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Kho lưu trữ tệp chưa sẵn sàng.");
  }
}
