import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppSettings, VietQrConfigurationInput } from "../../../shared/domain/models.js";
import { spawnCommand } from "../../../shared/main/spawn-command.js";

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const gcloudExecutable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";

function run(command: string, args: string[], cwd: string, input = "") {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawnCommand(command, args, { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stdin?.end(input);
    child.once("error", reject);
    child.once("close", code => resolve({ code, output }));
  });
}

function failureMessage(output: string, fallback: string) {
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) ?? fallback;
}

function validatedConfig(environment: AppSettings["environment"], input: VietQrConfigurationInput) {
  const expectedEnvironment: "production" | "sandbox" = environment === "production" ? "production" : "sandbox";
  const fields = ["apiBaseUrl", "apiUsername", "apiPassword", "bankCode", "bankAccount", "userBankName", "callbackUsername", "callbackPassword", "callbackSigningKey"] as const;
  const value = {} as VietQrConfigurationInput;
  for (const field of fields) {
    const item = input[field];
    if (typeof item !== "string" || !item.trim()) throw new Error(`VietQR ${field} is required.`);
    value[field] = item.trim();
  }
  const url = new URL(value.apiBaseUrl);
  if (url.protocol !== "https:") throw new Error("The VietQR API URL must use HTTPS.");
  return { ...value, environment: expectedEnvironment, apiBaseUrl: url.origin };
}

async function validateConnection(config: ReturnType<typeof validatedConfig>) {
  const authorization = Buffer.from(`${config.apiUsername}:${config.apiPassword}`).toString("base64");
  const response = await fetch(`${config.apiBaseUrl}/vqr/api/token_generate`, {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(`VietQR rejected the configuration: ${String(payload.message ?? `HTTP ${response.status}`)}.`);
  }
}

export async function configureVietQrRuntime(toolsRoot: string, webRoot: string, environment: AppSettings["environment"], input: VietQrConfigurationInput) {
  const targetName = environment === "development" ? "getgo-dev" : environment === "staging" ? "getgo-staging" : "getgo";
  const target = JSON.parse(await fs.readFile(path.join(toolsRoot, "configs", "deploys", targetName, "target.json"), "utf8")) as { firebaseProject?: string };
  if (!target.firebaseProject) throw new Error("The Firebase project is missing from the deployment configuration.");
  const config = validatedConfig(environment, input);
  await validateConnection(config);
  const secret = await run(npmExecutable, ["exec", "--", "firebase", "functions:secrets:set", "GETGO_VIETQR_CONFIG", "--project", target.firebaseProject, "--data-file=-", "--format=json"], webRoot, JSON.stringify(config));
  if (secret.code !== 0) throw new Error(failureMessage(secret.output, "Could not save the VietQR secret."));
  const project = await run(gcloudExecutable, ["projects", "describe", target.firebaseProject, "--format=value(projectNumber)"], webRoot);
  const projectNumber = project.output.trim();
  if (project.code !== 0 || !/^\d+$/.test(projectNumber)) throw new Error(failureMessage(project.output, "Could not resolve the Firebase project number."));
  const iam = await run(gcloudExecutable, ["secrets", "add-iam-policy-binding", "GETGO_VIETQR_CONFIG", `--project=${target.firebaseProject}`, `--member=serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`, "--role=roles/secretmanager.secretAccessor", "--quiet"], webRoot);
  if (iam.code !== 0) throw new Error(failureMessage(iam.output, "Could not grant the billing service access to the VietQR secret."));
  return { projectId: target.firebaseProject, environment: config.environment, bankAccountLast4: config.bankAccount.slice(-4) };
}
