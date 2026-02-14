import { render, Text, Box, useInput, useApp } from "ink";
import { useState } from "react";

const items = ["Projects", "Timeline", "Stats", "Quit"];

function App() {
  const [selected, setSelected] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => (s > 0 ? s - 1 : items.length - 1));
    } else if (key.downArrow) {
      setSelected((s) => (s < items.length - 1 ? s + 1 : 0));
    } else if (key.return) {
      if (items[selected] === "Quit") exit();
    } else if (input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        claudioscope
      </Text>
      <Text dimColor>Browse your Claude Code session history</Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item, i) => (
          <Text key={item}>
            {i === selected ? (
              <Text color="green" bold>{`▸ ${item}`}</Text>
            ) : (
              <Text>{`  ${item}`}</Text>
            )}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate  ⏎ select  q quit</Text>
      </Box>
    </Box>
  );
}

render(<App />);
