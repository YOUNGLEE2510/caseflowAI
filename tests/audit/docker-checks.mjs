import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { scanFile } from '/app/apps/api/dist/services/malwareScanner.js';

const results = [];
async function check(name, task) {
  try { await task(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, errorType: error?.name || 'Error', actualStatus: error?.actualStatus, expectedStatus: error?.expectedStatus }); }
}
async function ai(path, body, authenticate = true) {
  return fetch(`${process.env.AI_SERVICE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticate ? { 'X-Internal-Token': process.env.AI_INTERNAL_TOKEN } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
await check('AI rejects missing internal authentication', async () => {
  if ((await ai('/classify', { text: 'Audit account access request' }, false)).status !== 401) throw new Error('AuthenticationNotEnforced');
});
await check('AI classifies authenticated requests', async () => {
  const response = await ai('/classify', { text: 'Không đăng nhập được tài khoản sinh viên' });
  if (!response.ok || (await response.json()).label !== 'it_access') throw new Error('ClassificationFailed');
});
await check('AI retrieves the supplied source', async () => {
  const response = await ai('/knowledge/retrieve', { query: 'khôi phục mật khẩu', articles: [{ id: 'audit-fixture', title: 'Khôi phục mật khẩu', content: 'Tài liệu kiểm thử khôi phục mật khẩu bằng xác minh tài khoản.', category: 'it_access', sourceLabel: 'Audit fixture' }], topK: 1 });
  if (!response.ok || (await response.json()).citations?.[0]?.id !== 'audit-fixture') throw new Error('RetrievalFailed');
});
await check('Deployed AI rejects more than 100 similarity candidates', async () => {
  const response = await ai('/similarity', { text: 'audit request', items: Array.from({ length: 101 }, (_, id) => ({ id: String(id), title: 'Audit fixture', text: 'Audit request fixture' })) });
  if (response.status !== 422) throw Object.assign(new Error('CandidateLimitNotEnforced'), { actualStatus: response.status, expectedStatus: 422 });
});
await check('ClamAV accepts a clean buffer', async () => {
  if ((await scanFile(Buffer.from('%PDF-1.4\nAudit fixture\n%%EOF'))).scanStatus !== 'clean') throw new Error('ScannerDisabled');
});
await check('ClamAV rejects its standard test signature', async () => {
  const marker = ['X5O!P%@AP[4', '\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
  try { await scanFile(Buffer.from(marker)); }
  catch (error) { if (error?.status === 422) return; throw error; }
  throw new Error('SignatureNotRejected');
});
await check('S3 application credentials can access the bucket', async () => {
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } });
  try { await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })); }
  finally { client.destroy(); }
});
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results, llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL && process.env.LLM_ALLOWED_ORGANIZATIONS), note: 'Connectivity only: no database writes, object uploads, SMTP or paid LLM calls.' }, null, 2));
process.exitCode = results.some(result => !result.passed) ? 1 : 0;
