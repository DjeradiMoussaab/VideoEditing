import { spawn } from 'node:child_process';

const jobs = new Map();

export function startJobProcess(jobId, script, cwd) {
    if (jobs.has(jobId)) throw new Error('Project is already processing');
    const child = spawn(process.execPath, [script, jobId], {
        cwd, detached: process.platform !== 'win32', stdio: 'inherit'
    });
    const done = new Promise((resolve) => {
        child.once('error', () => resolve(1));
        child.once('close', (code) => resolve(code ?? 1));
    });
    const entry = { child, done };
    jobs.set(jobId, entry);
    done.then(() => { if (jobs.get(jobId) === entry) jobs.delete(jobId); });
    return done;
}

export async function stopJobProcess(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;
    // Each worker owns a process group, including its shell and FFmpeg children.
    // Stop the entire group before removing any inputs or outputs.
    try {
        if (process.platform === 'win32') job.child.kill('SIGKILL');
        else process.kill(-job.child.pid, 'SIGKILL');
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
    await job.done;
}
