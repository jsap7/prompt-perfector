import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Editor } from "./Editor.js";
import { RiskBar } from "./RiskBar.js";
import { SmellList } from "./SmellList.js";
import { ResultView } from "./ResultView.js";
import { analyze } from "../core/lint.js";
import { runPipeline } from "../core/run.js";
import { copy } from "../core/clipboard.js";
import type { Config } from "../core/config.js";
import type { Result } from "../core/types.js";

type Mode = "input" | "working" | "result" | "refine" | "error";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner({ note }: { note: string }) {
  const [i, setI] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <Text color="cyan">
      {SPINNER[i % SPINNER.length]} {note}
    </Text>
  );
}

export function App({ config, initial }: { config: Config; initial?: string }) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>(initial ? "working" : "input");
  const [raw, setRaw] = useState(initial ?? "");
  const [refineText, setRefineText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [detailed, setDetailed] = useState(false);

  // Free, instant, and updates as the words land — you can see the meter drop
  // while you talk, before spending anything.
  const live = useMemo(
    () => (raw.trim() ? analyze(raw, config.perAcu) : null),
    [raw, config.perAcu],
  );

  const go = React.useCallback(
    async (text: string, refine?: { instruction: string }) => {
      setMode("working");
      setCopied(false);
      try {
        const r = await runPipeline(
          text,
          config,
          refine && result
            ? { previous: result.perfected, instruction: refine.instruction }
            : undefined,
        );
        setResult(r);
        setMode("result");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setMode("error");
      }
    },
    [config, result],
  );

  React.useEffect(() => {
    if (initial) void go(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput(
    (input, key) => {
      if (mode === "result" || mode === "error") {
        if (input === "q" || key.escape) return exit();
        if (input === "c" && result) {
          void copy(result.rendered)
            .then(() => setCopied(true))
            .catch(() => setError("clipboard unavailable"));
          return;
        }
        if (input === "w" && result) {
          setDetailed((d) => !d);
          return;
        }
        if (input === "r" && result) {
          setRefineText("");
          setMode("refine");
          return;
        }
        if (input === "n") {
          setRaw("");
          setResult(null);
          setMode("input");
          return;
        }
      }
    },
    { isActive: mode === "result" || mode === "error" },
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text backgroundColor="magenta" color="white" bold>
          {" PP "}
        </Text>
        <Text bold> prompt perfector</Text>
        <Text dimColor> · talk loose, send tight</Text>
      </Box>

      {mode === "input" && (
        <Box flexDirection="column">
          <Box
            borderStyle="round"
            borderColor={live && live.before.score > 60 ? "red" : "gray"}
            paddingX={1}
            flexDirection="column"
          >
            <Editor
              value={raw}
              onChange={setRaw}
              onSubmit={() => void go(raw)}
              isActive
              placeholder="Hit your Wispr Flow key and just say what you want Devin to do…"
            />
          </Box>

          {live && (
            <Box flexDirection="column" marginTop={1}>
              <RiskBar risk={live.before} label="as-is" />
              <Box marginTop={1} flexDirection="column">
                <SmellList smells={live.smells} detailed={false} />
              </Box>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>
              enter = new line · blank line or ctrl+d = perfect it · ctrl+u = clear
            </Text>
          </Box>
        </Box>
      )}

      {mode === "refine" && (
        <Box flexDirection="column">
          <Text color="cyan">What should change?</Text>
          <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
            <Editor
              value={refineText}
              onChange={setRefineText}
              onSubmit={() => void go(raw, { instruction: refineText })}
              isActive
              placeholder="e.g. the file is actually src/auth/session.ts, and skip step 3"
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>blank line or ctrl+d = re-perfect</Text>
          </Box>
        </Box>
      )}

      {mode === "working" && (
        <Spinner note="tightening…" />
      )}

      {mode === "error" && (
        <Box flexDirection="column">
          <Text color="red">✗ {error}</Text>
          <Box marginTop={1}>
            <Text dimColor>n = start over · q = quit</Text>
          </Box>
        </Box>
      )}

      {mode === "result" && result && (
        <Box flexDirection="column">
          <ResultView result={result} copied={copied} />

          {detailed && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>
                what was costing you
              </Text>
              <SmellList smells={result.analysis.smells} detailed />
            </Box>
          )}

          <Box marginTop={1}>
            {copied ? (
              <Text color="green" bold>
                ✓ copied — paste into Devin{"   "}
              </Text>
            ) : (
              <Text color="cyan" bold>
                c = copy{"   "}
              </Text>
            )}
            <Text dimColor>r = refine · w = why · n = new · q = quit</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
