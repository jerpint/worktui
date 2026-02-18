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

// Rows: 0=delete branch, 1=force, 2=confirm (No/Yes)
type Row = 0 | 1 | 2;

export default function DeleteConfirm({ worktree, onBack, onQuit }: DeleteConfirmProps) {
  const isInsideWorktree = process.cwd().startsWith(worktree.path);
  const [deleteBranchFlag, setDeleteBranchFlag] = useState(false);
  const [forceFlag, setForceFlag] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [row, setRow] = useState<Row>(2);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useInput((input, key) => {
    if (deleting) return;

    if (success) {
      if (key.escape || key.return) {
        onBack();
      }
      return;
    }

    if (key.escape || input === "h") {
      onBack();
      return;
    }
    if (input === "q") {
      onQuit();
      return;
    }

    // Vertical navigation
    if (input === "j" || key.downArrow) {
      setRow((r) => (r < 2 ? (r + 1) as Row : 0));
      return;
    }
    if (input === "k" || key.upArrow) {
      setRow((r) => (r > 0 ? (r - 1) as Row : 2));
      return;
    }

    // Horizontal toggle on confirm row
    if (row === 2 && (key.leftArrow || key.rightArrow || input === "l")) {
      setConfirm((v) => !v);
      return;
    }

    // Enter toggles checkboxes or confirms
    if (key.return) {
      if (row === 0) {
        setDeleteBranchFlag((v) => !v);
      } else if (row === 1) {
        setForceFlag((v) => !v);
      } else {
        if (confirm) {
          doDelete();
        } else {
          onBack();
        }
      }
      return;
    }

    // Space also toggles
    if (input === " ") {
      if (row === 0) setDeleteBranchFlag((v) => !v);
      else if (row === 1) setForceFlag((v) => !v);
      else setConfirm((v) => !v);
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

  if (isInsideWorktree) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">Cannot delete this worktree</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>You are currently inside this worktree.</Text>
          <Text>cd to a different directory first, then try again.</Text>
        </Box>
        <StatusBar hints={[{ key: "esc", label: "back" }]} />
      </Box>
    );
  }

  if (success) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">Worktree deleted.</Text>
        {deleteBranchFlag && <Text>Branch {worktree.branch} also deleted.</Text>}
        <StatusBar hints={[{ key: "esc/\u23CE", label: "back" }]} />
      </Box>
    );
  }

  const checkbox = (checked: boolean, focused: boolean) => {
    const mark = checked ? "x" : " ";
    if (focused) return <Text color="green" bold inverse>{` [${mark}] `}</Text>;
    return <Text color={checked ? "green" : "gray"}>[{mark}]</Text>;
  };

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
        <Box>
          {checkbox(deleteBranchFlag, row === 0)}
          <Text color={row === 0 ? "green" : undefined}> Also delete local branch</Text>
        </Box>
        <Box>
          {checkbox(forceFlag, row === 1)}
          <Text color={row === 1 ? "green" : undefined}> Force delete</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text>  </Text>
        <Text
          color={confirm ? undefined : "red"}
          bold={!confirm || row === 2}
          inverse={!confirm && row === 2}
        >
          {" No "}
        </Text>
        <Text>  </Text>
        <Text
          color={confirm ? "green" : undefined}
          bold={confirm || row === 2}
          inverse={confirm && row === 2}
        >
          {" Yes "}
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
          { key: "j/k", label: "navigate" },
          { key: "\u23CE/space", label: "toggle" },
          { key: "\u2190\u2192", label: "yes/no" },
          { key: "esc", label: "cancel" },
        ]}
      />
    </Box>
  );
}
