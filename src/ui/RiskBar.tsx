import React from "react";
import { Box, Text } from "ink";
import type { Risk } from "../core/types.js";
import { bandColor, bandLabel, money } from "./theme.js";

const WIDTH = 28;

export function RiskBar({ risk, label }: { risk: Risk; label: string }) {
  const filled = Math.max(1, Math.round((risk.score / 100) * WIDTH));
  const color = bandColor(risk.band);

  return (
    <Box>
      <Text dimColor>{label.padEnd(9)}</Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(WIDTH - filled)}</Text>
      <Text> </Text>
      <Text color={color} bold>
        {bandLabel(risk.band).padEnd(9)}
      </Text>
      <Text dimColor>
        ~{risk.acuLow}–{risk.acuHigh} ACU
      </Text>
      <Text dimColor>
        {"  "}
        {money(risk.costLow)}–{money(risk.costHigh)}
      </Text>
    </Box>
  );
}
