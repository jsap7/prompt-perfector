import React from "react";
import { Box, Text } from "ink";
import type { Result } from "../core/types.js";
import { RiskBar } from "./RiskBar.js";
import { money } from "./theme.js";

export function ResultView({ result, copied }: { result: Result; copied: boolean }) {
  const { analysis, after, perfected, rendered, usage } = result;
  const savedLow = Math.max(0, analysis.before.costLow - after.costLow);
  const savedHigh = Math.max(0, analysis.before.costHigh - after.costHigh);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <RiskBar risk={analysis.before} label="before" />
        <RiskBar risk={after} label="after" />
        {savedHigh > 0 && (
          <Box marginTop={1}>
            <Text dimColor>{"         "}</Text>
            <Text color="green" bold>
              saves ~{money(savedLow)}–{money(savedHigh)} of Devin time
            </Text>
            {usage && (
              <Text dimColor>
                {"  ·  cost to perfect: "}
                {usage.costUsd < 0.01 ? "<$0.01" : money(usage.costUsd)}
              </Text>
            )}
          </Box>
        )}
      </Box>

      {perfected.gaps.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow" bold>
            ANSWER THESE — free for you, ACUs for Devin
          </Text>
          {perfected.gaps.map((g, i) => (
            <Text key={i} color="yellow">
              {"  ? "}
              {g}
            </Text>
          ))}
        </Box>
      )}

      {perfected.splitOut.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>
            SPLIT INTO SEPARATE SESSIONS
          </Text>
          {perfected.splitOut.map((s, i) => (
            <Text key={i} color="magenta">
              {"  ⇢ "}
              {s}
            </Text>
          ))}
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={copied ? "green" : "gray"}
        paddingX={1}
      >
        <Text>{rendered.trimEnd()}</Text>
      </Box>

      {perfected.notes.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {perfected.notes.map((n, i) => (
            <Text key={i} dimColor>
              · {n}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
