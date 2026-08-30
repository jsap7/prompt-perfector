import React from "react";
import { Box, Text } from "ink";
import type { Smell } from "../core/types.js";
import { sevColor, sevMark } from "./theme.js";

export function SmellList({ smells, detailed }: { smells: Smell[]; detailed: boolean }) {
  if (!smells.length) {
    return (
      <Text color="green">  ✓ nothing here would send Devin exploring.</Text>
    );
  }

  return (
    <Box flexDirection="column">
      {smells.map((s) => (
        <Box key={s.id} flexDirection="column" marginBottom={detailed ? 1 : 0}>
          <Box>
            <Text color={sevColor(s.severity)}>{sevMark(s.severity)} </Text>
            <Text color={sevColor(s.severity)} bold>
              {s.id.replace(/_/g, " ").toLowerCase().padEnd(18)}
            </Text>
            <Text dimColor>{s.evidence}</Text>
          </Box>
          {detailed && (
            <Box flexDirection="column" marginLeft={4}>
              <Text dimColor>{s.why}</Text>
              <Text color="gray">→ {s.fix}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
