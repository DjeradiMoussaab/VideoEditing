// Commit only completed units. The same saved project can retry a failed unit
// without re-running successful model requests or downloading finished media.
export function createDraftCheckpoint(manifest, persist) {
    manifest.draftCheckpoint ||= { version: 1, tasks: {} };
    const state = manifest.draftCheckpoint;
    state.tasks ||= {};
    return {
        async run(key, work, valid = () => true) {
            const saved = state.tasks[key];
            if (saved && valid(saved.value)) return structuredClone(saved.value);
            state.activeTask = key;
            delete state.tasks[key];
            persist();
            const value = await work();
            state.tasks[key] = { value: structuredClone(value), completedAt: new Date().toISOString() };
            state.activeTask = null;
            persist();
            return value;
        }
    };
}
