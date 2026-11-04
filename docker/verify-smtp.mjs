import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Usage: node docker/verify-smtp.mjs recipient@example.com");
const desktopDocker = resolve(process.env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
const docker = process.env.DOCKER_BIN || (process.platform === "win32" && existsSync(desktopDocker) ? desktopDocker : "docker");
const code = `
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
const required=['SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length) { console.log(JSON.stringify({status:'not_configured',missing,sent:false})); process.exitCode=2; }
else {
  const port=Number(process.env.SMTP_PORT||465);
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  try {
    await transport.verify();
    const id=randomUUID();
    const result=await transport.sendMail({from:process.env.SMTP_FROM,to:${JSON.stringify(to)},subject:'[CaseFlow] SMTP delivery test '+id,
      text:'This is a requested CaseFlow SMTP verification email. No case data or attachments are included. Test ID: '+id,
      html:'<p>This is a requested CaseFlow SMTP verification email. No case data or attachments are included.</p><p>Test ID: '+id+'</p>'});
    const accepted=Array.isArray(result.accepted)?result.accepted.length:0;
    console.log(JSON.stringify({status:accepted?'accepted_by_smtp':'rejected',sent:accepted>0,acceptedRecipients:accepted,
      rejectedRecipients:result.rejected?.length||0,messageId:result.messageId,inboxDeliveryConfirmed:false}));
    if(!accepted) process.exitCode=1;
  } catch(error) { console.log(JSON.stringify({status:'failed',sent:false,code:error.code||'SMTP_ERROR',command:error.command||null})); process.exitCode=1; }
  finally { transport.close(); }
}`;
const result = spawnSync(docker, ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "--input-type=module"], {
  cwd: root, input: code, encoding: "utf8", timeout: 120000
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) console.error("SMTP verification could not complete; inspect container configuration.");
process.exitCode = result.status ?? 1;
