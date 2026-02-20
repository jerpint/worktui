import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { getGitRoot, createWorktree } from "../git.js";
import { branchToFolder } from "../utils.js";
import { resolve } from "path";
import StatusBar from "./StatusBar.js";

interface CreateWorktreeProps {
  onBack: () => void;
  onQuit: () => void;
}

export default function CreateWorktree({ onBack, onQuit }: CreateWorktreeProps) {
  const [branch, setBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (input === "q" && !branch) {
      onQuit();
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const gitRoot = await getGitRoot();
      const path = await createWorktree(gitRoot, value.trim());
      setSuccess(path);
    } catch (err: any) {
      setError(err.message);
    }
    setCreating(false);
  };

  const folderName = branch ? branchToFolder(branch) : "";

  if (success) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">Worktree created!</Text>
        <Text>Path: {success}</Text>
        <StatusBar hints={[{ key: "esc", label: "back" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Create Worktree</Text>

      <Box marginTop={1}>
        <Text>Branch name: </Text>
        {creating ? (
          <Text color="yellow">Creating...</Text>
        ) : (
          <TextInput
            value={branch}
            onChange={setBranch}
            onSubmit={handleSubmit}
          />
        )}
      </Box>

      {folderName && (
        <Box>
          <Text dimColor>Path: ~/.worktui/.../{folderName}</Text>
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <StatusBar
        hints={[
          { key: "\u23CE", label: "confirm" },
          { key: "esc", label: "cancel" },
        ]}
      />
    </Box>
  );
}
