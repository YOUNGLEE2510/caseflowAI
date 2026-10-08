import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";

const client = new S3Client({
  endpoint: config.S3_ENDPOINT, region: config.S3_REGION, forcePathStyle: Boolean(config.S3_ENDPOINT),
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 }
});

export async function initializeObjectStorage() {
  if (config.STORAGE_PROVIDER !== "s3") return;
  try { await client.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET })); }
  catch (error) {
    if ((error as any)?.$metadata?.httpStatusCode !== 404) throw error;
    try { await client.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET,
      ...(config.S3_REGION !== "us-east-1" ? { CreateBucketConfiguration: { LocationConstraint: config.S3_REGION as any } } : {})
    })); } catch (creationError) {
      if ((creationError as any)?.$metadata?.httpStatusCode !== 409) throw creationError;
      await client.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
    }
  }
}

export async function storeObject(key: string, body: Buffer, contentType: string) {
  await client.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}
export async function deleteObject(key: string) {
  await client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}
export async function getObjectStream(key: string) {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    if (!(result.Body instanceof Readable)) throw new Error("Missing object body");
    return result.Body;
  } catch (error) {
    if ((error as any)?.$metadata?.httpStatusCode === 404) throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
    throw new HttpError(503, "Kho lưu trữ tệp chưa sẵn sàng.");
  }
}
