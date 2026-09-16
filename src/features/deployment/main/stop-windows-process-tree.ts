import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
type ExecuteTaskkill = (args: string[]) => Promise<unknown>;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    // An inaccessible process is not proof that it has exited.
    return (cause as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export async function stopWindowsProcessTree(
  pid: number,
  force = false,
  execute: ExecuteTaskkill = args => execFileAsync("taskkill", args, { windowsHide: true }),
  isAlive: (pid: number) => boolean = isProcessAlive,
): Promise<void> {
  const args = ["/PID", String(pid), "/T"];
  try {
    await execute([...args, ...(force ? ["/F"] : [])]);
  } catch (cause) {
    if (!isAlive(pid)) return;
    if (force) throw cause;
    // Console processes can reject a non-forced taskkill. Do not let that
    // expected rejection bypass the forced-stop fallback.
    try {
      await execute([...args, "/F"]);
    } catch (forceCause) {
      if (isAlive(pid)) throw forceCause;
    }
  }
}
