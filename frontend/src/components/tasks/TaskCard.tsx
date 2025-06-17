"use client"

import { AgentSession } from "../../api/api";
import { getDomainColor } from "../../lib/utils";

interface TaskCardProps {
  task: AgentSession
  onClick: () => void
}

const TaskCard = ({ task, onClick }: TaskCardProps) => {
  // Extract a title from the task instruction if no title is provided
  const title = task.description || (task.task_instruction ? task.task_instruction.split(". ")[0] : "Untitled Task");

  // Truncate the description for display
  const description = task.task_instruction
    ? task.task_instruction.length > 150
      ? task.task_instruction.substring(0, 150) + "..."
      : task.task_instruction
    : "No description available";

  return (
    <div
      className="bg-card rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg cursor-pointer h-full flex flex-col border border-border group relative hover:-translate-y-1"
      onClick={onClick}
    >
      <div className="relative">
        <div
          className="h-1.5 w-full transition-all duration-300 group-hover:h-2.5 absolute top-0 left-0"
          style={{ backgroundColor: getDomainColor(task.metadata.domain) }}
        ></div>

        {/* Domain tag */}
        <div className="p-4">
          <span
            className="inline-block px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${getDomainColor(task.metadata.domain)}20`,
              color: getDomainColor(task.metadata.domain),
            }}
          >
            {task.metadata.domain || "Uncategorized"}
          </span>
        </div>
      </div>

      <div className="p-5 flex-1 overflow-hidden">
        <h3 className="font-semibold text-lg mb-2 line-clamp-2 text-card-foreground">{title}</h3>

        <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center justify-between mt-auto">
        <div className="text-xs text-muted-foreground">{task.metadata.source === "user" ? "My Task" : "Community Task"}</div>
        {task.metadata.source === "user" && <div className="text-xs text-muted-foreground">
          {task.metadata.created_at 
            ? new Date(task.metadata.created_at * 1000).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })
          : 'No date'}</div>}
      </div>
    </div>
  )
};

export default TaskCard
