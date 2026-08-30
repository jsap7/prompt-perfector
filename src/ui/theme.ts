import type { Risk, Severity } from "../core/types.js";

export const bandColor = (band: Risk["band"]): string =>
  band === "tight" ? "green" : band === "ok" ? "cyan" : band === "loose" ? "yellow" : "red";

export const bandLabel = (band: Risk["band"]): string =>
  band === "tight"
    ? "TIGHT"
    : band === "ok"
      ? "OK"
      : band === "loose"
        ? "LOOSE"
        : "WIDE OPEN";

export const sevColor = (s: Severity): string =>
  s === "critical" ? "red" : s === "high" ? "yellow" : s === "medium" ? "cyan" : "gray";

export const sevMark = (s: Severity): string =>
  s === "critical" ? "!!" : s === "high" ? " !" : s === "medium" ? " ~" : " ·";

export const money = (n: number): string => `$${n.toFixed(2)}`;
