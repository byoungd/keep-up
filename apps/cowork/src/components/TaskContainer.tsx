import { TaskTimeline } from "../features/tasks/components/TaskTimeline";
import type { TaskGraph } from "../features/tasks/types";

interface TaskContainerProps {
  graph: TaskGraph;
  isConnected: boolean;
  approveTool: (approvalId: string) => void;
  rejectTool: (approvalId: string) => void;
}

export function TaskContainer({ graph, isConnected, approveTool, rejectTool }: TaskContainerProps) {
  return (
    <section className="card-panel task-container h-full flex flex-col p-0 overflow-hidden">
      {/* 
        Ideally TaskTimeline handles the header/layout, 
        or we keep the header here? 
        TaskTimeline has a header already in the existing file.
        So we just render TaskTimeline here.
      */}
      <TaskTimeline
        graph={graph}
        isConnected={isConnected}
        approveTool={approveTool}
        rejectTool={rejectTool}
      />
    </section>
  );
}
