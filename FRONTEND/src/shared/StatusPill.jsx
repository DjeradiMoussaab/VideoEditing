export function StatusPill({ status }) {
  const map = {
    idle: "Idle",
    draft_running: "Generating scenes",
    editing: "Editing",
    final_running: "Generating final",
    done: "Done",
    error: "Error"
  };

  return <span className={`status-pill ${status}`}>{map[status] || status}</span>;
}
