import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface SearchBarProps {
  value: string;
  focused: boolean;
  suffix?: string;
}

export default function SearchBar({ value, focused, suffix }: SearchBarProps) {
  const borderColor = focused ? theme.modeInsert : theme.dim;

  return (
    <Box
      borderStyle="round"
      width="50%"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text color={focused ? theme.modeInsert : theme.dim}>{"> "}</Text>
      {value && <Text color={theme.text}>{value}</Text>}
      {focused && <Text color={theme.modeInsert}>|</Text>}
      {suffix && <Text color={theme.dim}> {suffix}</Text>}
    </Box>
  );
}
