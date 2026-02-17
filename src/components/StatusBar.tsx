import { Box, Text } from "ink";

interface Hint {
  key: string;
  label: string;
}

interface StatusBarProps {
  hints: Hint[];
}

export default function StatusBar({ hints }: StatusBarProps) {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        {hints.map((h, i) => (
          <Text key={h.key}>
            {i > 0 ? "  " : ""}
            <Text bold>{h.key}</Text> {h.label}
          </Text>
        ))}
      </Text>
    </Box>
  );
}
