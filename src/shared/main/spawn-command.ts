import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Windows cannot execute npm.cmd (or another command script) directly through
 * CreateProcess. Use the command shell only for those scripts; native
 * executables continue to launch without a shell on every platform.
 */
export function spawnCommand(
  executable: string,
  args: string[],
  options: SpawnOptions,
): ChildProcess {
  const requiresWindowsShell = process.platform === "win32"
    && /\.(?:cmd|bat)$/i.test(executable);
  return spawn(executable, args, {
    ...options,
    shell: requiresWindowsShell,
    windowsHide: true,
  });
}
