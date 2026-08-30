import { spawn } from "node:child_process";

/** Copy via the platform's native clipboard binary. No dependency needed. */
export function copy(text: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy", []]
      : process.platform === "win32"
        ? ["clip", []]
        : ["xclip", ["-selection", "clipboard"]];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd[0] as string, cmd[1] as string[], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`clipboard exited ${code}`)),
    );
    child.stdin.end(text);
  });
}
