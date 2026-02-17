import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Worktree } from "../types.js";
import { getGitRoot, removeWorktree, deleteBranch } from "../git.js";
import StatusBar from "./StatusBar.js";

interface DeleteConfirmProps {
  worktree: Worktree;
  onBack: () => void;
  onQuit: () => void;
}

export default function DeleteConfirm({ worktree, onBack, onQuit }: DeleteConfirmProps) {
  const [deleteBranchFlag, setDeleteBranchFlag] = useState(false);
  const [forceFlag, setForceFlag] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useInput((input, key) => {
    if (deleting) return;

    if (success) {
      if (key.escape || input === "n" || key.return) {
        onBack();
      }
      return;
    }

    if (input === "n" || key.escape) {
      onBack();
      return;
    }
    if (input === "q") {
      onQuit();
      return;
    }
    if (input === "b") {
      setDeleteBranchFlag((v) => !v);
    }
    if (input === "f") {
      setForceFlag((v) => !v);
    }
    if (input === "y") {
      doDelete();
    }
  });

  const doDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const gitRoot = await getGitRoot();
      await removeWorktree(gitRoot, worktree.path, forceFlag);
      if (deleteBranchFlag && worktree.branch) {
        await deleteBranch(gitRoot, worktree.branch, forceFlag);
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    }
    setDeleting(false);
  };

  if (success) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">Worktree deleted.</Text>
        {deleteBranchFlag && <Text>Branch {worktree.branch} also deleted.</Text>}
        <StatusBar hints={[{ key: "esc/\u23CE", label: "back" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="red">Delete worktree?</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>Branch: <Text bold>{worktree.branch}</Text></Text>
        <Text>
          Status:{" "}
          {worktree.isDirty ? (
            <Text color="red" bold>DIRTY (uncommitted changes!)</Text>
          ) : (
            <Text color="green">clean</Text>
          )}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={deleteBranchFlag ? "green" : "gray"}>
            [{deleteBranchFlag ? "x" : " "}]
          </Text>
          {" "}Also delete local branch
        </Text>
        <Text>
          <Text color={forceFlag ? "green" : "gray"}>
            [{forceFlag ? "x" : " "}]
          </Text>
          {" "}Force delete
        </Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {deleting && (
        <Box marginTop={1}>
          <Text color="yellow">Deleting...</Text>
        </Box>
      )}

      <StatusBar
        hints={[
          { key: "b", label: "toggle branch" },
          { key: "f", label: "toggle force" },
          { key: "y", label: "confirm" },
          { key: "n", label: "cancel" },
        ]}
      />
    </Box>
  );
}
