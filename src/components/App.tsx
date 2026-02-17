import { useApp } from "ink";
import { useState } from "react";
import type { View, ResumeTarget } from "../types.js";
import WorktreeList from "./WorktreeList.js";
import WorktreeDetail from "./WorktreeDetail.js";
import CreateWorktree from "./CreateWorktree.js";
import DeleteConfirm from "./DeleteConfirm.js";
import Cleanup from "./Cleanup.js";

interface AppProps {
  initialView: View;
  onResume: (target: ResumeTarget) => void;
}

export default function App({ initialView, onResume }: AppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<View>(initialView);

  const navigate = (v: View) => setView(v);
  const goHome = () => setView({ kind: "list" });
  const quit = () => exit();

  switch (view.kind) {
    case "list":
      return <WorktreeList onNavigate={navigate} onQuit={quit} />;
    case "detail":
      return (
        <WorktreeDetail
          worktree={view.worktree}
          onBack={goHome}
          onQuit={quit}
          onResume={onResume}
        />
      );
    case "create":
      return <CreateWorktree onBack={goHome} onQuit={quit} />;
    case "delete":
      return <DeleteConfirm worktree={view.worktree} onBack={goHome} onQuit={quit} />;
    case "cleanup":
      return <Cleanup onBack={goHome} onQuit={quit} />;
  }
}
