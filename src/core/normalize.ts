/**
 * Dictation cleanup.
 *
 * Wispr Flow transcribes speech faithfully, which means it also transcribes
 * hesitation, politeness, and spoken punctuation. None of that changes what
 * Devin should do, but all of it dilutes the instruction.
 */

const FILLER = [
  "um", "uh", "erm", "er", "hmm",
  "you know", "i mean", "like i said", "basically", "essentially",
  "so yeah", "yeah so", "okay so", "ok so", "right so", "alright so",
  "anyway", "anyways", "let me think", "let's see", "lets see",
  "sort of", "kind of", "i guess", "or whatever",
];

const POLITENESS = [
  "i need you to", "i want you to", "i'd like you to", "id like you to",
  "can you please", "could you please", "can you", "could you", "would you",
  "please go ahead and", "please", "go ahead and", "i was hoping you could",
  "what i want is for you to", "what i need is",
];

const rx = (phrases: string[], flags = "gi") =>
  new RegExp(`\\b(?:${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})\\b`, flags);

const FILLER_RX = rx(FILLER);
const POLITE_RX = rx(POLITENESS);

const EXTS = "ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|cs|sql|json|yaml|yml|toml|md|sh|css|scss|html|vue|svelte";

export interface Normalized {
  text: string;
  /** What was cleaned up, for display. */
  changes: string[];
}

export function normalize(raw: string): Normalized {
  let t = raw.trim();
  const changes: string[] = [];
  const note = (n: string) => {
    if (!changes.includes(n)) changes.push(n);
  };

  // "src slash payments slash stripe dot ts" -> "src/payments/stripe.ts"
  const beforePaths = t;
  t = t.replace(/\b([\w-]+)\s+slash\s+/gi, "$1/");
  t = t.replace(new RegExp(`\\b([\\w/-]+)\\s+dot\\s+(${EXTS})\\b`, "gi"), "$1.$2");
  t = t.replace(/\b([\w/-]+)\s+dot\s+([\w-]+)\s+dot\s+/gi, "$1.$2.");
  if (t !== beforePaths) note("joined spoken file paths");

  // "underscore" / "dash" between words
  const beforeSep = t;
  t = t.replace(/\b(\w+)\s+underscore\s+(\w+)\b/gi, "$1_$2");
  t = t.replace(/\b(\w+)\s+dash\s+(\w+)\b/gi, "$1-$2");
  if (t !== beforeSep) note("joined spoken identifiers");

  if (POLITE_RX.test(t)) {
    t = t.replace(POLITE_RX, " ");
    note("dropped politeness preamble");
  }

  if (FILLER_RX.test(t)) {
    t = t.replace(FILLER_RX, " ");
    note("removed dictation filler");
  }

  // Doubled words from restarts: "the the file"
  const beforeDup = t;
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  if (t !== beforeDup) note("collapsed repeated words");

  // Tidy the punctuation left behind by removals.
  t = t
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;])\s*(?=[,;.])/g, "")
    .replace(/\b(and|but|then|so)\s*,\s*/gi, "$1 ")
    .replace(/^\s*[,;.]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // A spoken restart usually means the earlier clause is stale. Too risky to
  // delete automatically, so surface it instead.
  if (/\b(actually|wait|no scratch that|scratch that|i mean no)\b/i.test(t)) {
    note("contains a spoken correction — check the right version survived");
  }

  return { text: t, changes };
}
