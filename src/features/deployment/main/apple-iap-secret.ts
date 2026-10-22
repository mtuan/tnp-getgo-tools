import { promises as fs } from "node:fs";
import path from "node:path";
import type { WebDeploymentTarget } from "../../../shared/domain/models.js";
import { spawnCommand } from "../../../shared/main/spawn-command.js";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

function runFirebase(root: string, args: string[], input: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawnCommand(npmExecutable, args, { cwd: root, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stdin?.end(input);
    child.once("error", reject);
    child.once("close", code => resolve({ code, output }));
  });
}

export async function configureAppleIapSecret(toolsRoot: string, webRoot: string, target: ReleaseTarget) {
  const targetName = target === "staging" ? "getgo-staging" : "getgo";
  const targetConfig = JSON.parse(await fs.readFile(path.join(toolsRoot, "configs", "deploys", targetName, "target.json"), "utf8")) as { firebaseProject?: string };
  if (!targetConfig.firebaseProject) throw new Error("The Firebase project is missing from the deployment configuration.");
  const [nativeConfigSource, appConfigSource] = await Promise.all([
    fs.readFile(path.join(webRoot, "configs", "native", target, "config.json"), "utf8"),
    fs.readFile(path.join(webRoot, "native-app.json"), "utf8"),
  ]);
  const nativeConfig = JSON.parse(nativeConfigSource) as { ios?: { bundleId?: string } };
  const appConfig = JSON.parse(appConfigSource) as { appStoreId?: string };
  const bundleId = nativeConfig.ios?.bundleId;
  const appAppleId = Number(appConfig.appStoreId);
  if (!bundleId || !Number.isSafeInteger(appAppleId)) throw new Error("The Apple app identity is incomplete.");
  const result = await runFirebase(webRoot, [
    "exec", "--", "firebase", "functions:secrets:set", "GETGO_APPLE_IAP_CONFIG",
    "--project", targetConfig.firebaseProject, "--data-file=-", "--format=json",
  ], JSON.stringify({ bundleId, appAppleId }));
  if (result.code !== 0) {
    const message = result.output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1);
    throw new Error(message ?? "Apple purchase setup failed.");
  }
}
