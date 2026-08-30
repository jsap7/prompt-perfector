import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * An unset ANTHROPIC_API_KEY does not mean there are no credentials.
 *
 * The SDK resolves, in order: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, an
 * `ant auth login` OAuth profile on disk, then Workload Identity Federation.
 * A bare `new Anthropic()` picks up any of them, so PP must not refuse to
 * start just because the first one is missing — that is the exact setup we
 * recommend for a shared team org.
 */
export function credentialSource(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return "ANTHROPIC_API_KEY";
  if (process.env.ANTHROPIC_AUTH_TOKEN) return "ANTHROPIC_AUTH_TOKEN";

  const cfgHome =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  const profileDir = path.join(cfgHome, "anthropic");
  try {
    if (fs.readdirSync(profileDir).length > 0) {
      return process.env.ANTHROPIC_PROFILE
        ? `ant profile "${process.env.ANTHROPIC_PROFILE}"`
        : "ant auth profile";
    }
  } catch {
    /* no profile directory */
  }

  if (
    process.env.ANTHROPIC_FEDERATION_RULE_ID &&
    process.env.ANTHROPIC_ORGANIZATION_ID
  ) {
    return "workload identity federation";
  }

  return null;
}
