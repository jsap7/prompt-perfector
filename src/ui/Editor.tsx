import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isActive: boolean;
  placeholder?: string;
}

/**
 * Multiline buffer built for dictation.
 *
 * Wispr Flow delivers a whole utterance as one large input chunk rather than
 * per-character events, so any input longer than one character is inserted
 * verbatim instead of being interpreted as a keypress.
 */
export function Editor({ value, onChange, onSubmit, isActive, placeholder }: Props) {
  const [cursor, setCursor] = useState(value.length);

  const clamp = (n: number) => Math.max(0, Math.min(value.length, n));

  const insert = (chunk: string) => {
    const at = clamp(cursor);
    onChange(value.slice(0, at) + chunk + value.slice(at));
    setCursor(at + chunk.length);
  };

  useInput(
    (input, key) => {
      // Ctrl+D always submits, wherever the cursor is.
      if (key.ctrl && input === "d") {
        if (value.trim()) onSubmit();
        return;
      }
      if (key.ctrl && input === "u") {
        onChange("");
        setCursor(0);
        return;
      }

      if (key.return) {
        // Blank line = done talking. Otherwise keep building the utterance.
        if (/\n\s*$/.test(value) || value.trim() === "") {
          if (value.trim()) onSubmit();
          return;
        }
        insert("\n");
        return;
      }

      if (key.backspace || key.delete) {
        const at = clamp(cursor);
        if (at === 0) return;
        onChange(value.slice(0, at - 1) + value.slice(at));
        setCursor(at - 1);
        return;
      }

      if (key.leftArrow) return setCursor(clamp(cursor - 1));
      if (key.rightArrow) return setCursor(clamp(cursor + 1));
      if (key.upArrow) return setCursor(0);
      if (key.downArrow) return setCursor(value.length);

      // Dictation arrives here as a multi-character chunk.
      if (input && !key.ctrl && !key.meta && !key.escape) insert(input);
    },
    { isActive },
  );

  if (!value) {
    return (
      <Box>
        <Text dimColor>{isActive ? "▏" : " "}</Text>
        <Text dimColor italic>
          {placeholder ?? ""}
        </Text>
      </Box>
    );
  }

  const at = clamp(cursor);
  const before = value.slice(0, at);
  const under = value.slice(at, at + 1) || " ";
  const after = value.slice(at + 1);

  return (
    <Box>
      <Text>
        {before}
        {isActive ? <Text inverse>{under}</Text> : <Text>{under}</Text>}
        {after}
      </Text>
    </Box>
  );
}
