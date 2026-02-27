import { useApp } from "ink";
import { useState } from "react";
import type { View, LaunchTarget } from "../types.js";
import WorktreeList from "./WorktreeList.js";
import CreateWorktree from "./CreateWorktree.js";
import DeleteConfirm from "./DeleteConfirm.js";
import Cleanup from "./Cleanup.js";
import FetchBranch from "./FetchBranch.js";

interface AppProps {
  initialView: View;
  onLaunch: (target: LaunchTarget) => void;
}

export default function App({ initialView, onLaunch }: AppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<View>(initialView);

  const navigate = (v: View) => setView(v);
  const goHome = () => setView({ kind: "list" });
  const quit = () => exit();

  switch (view.kind) {
    case "list":
      return <WorktreeList onNavigate={navigate} onLaunch={onLaunch} onQuit={quit} />;
    case "create":
      return <CreateWorktree onBack={goHome} onQuit={quit} />;
    case "delete":
      return <DeleteConfirm worktree={view.worktree} onBack={goHome} onQuit={quit} />;
    case "cleanup":
      return <Cleanup onBack={goHome} onQuit={quit} />;
    case "fetch":
      return <FetchBranch onBack={goHome} onQuit={quit} onLaunch={onLaunch} />;
  }
}
