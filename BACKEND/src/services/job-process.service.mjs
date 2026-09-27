import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';

const jobs = new Map();

function processSnapshot() {
    // Read the full command, not just a PID: PIDs can be reused after a restart.
    const output = execFileSync('ps', ['-axo', 'pid=,pgid=,stat=,command='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return output.split('\n').flatMap(line => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        return match ? [{ pid: Number(match[1]), group: Number(match[2]), state: match[3], command: match[4] }] : [];
    });
}

function recoverWorkers(jobId) {
    if (process.platform === 'win32') {
        throw new Error('Worker recovery after a server restart is not supported on Windows.');
    }
    const argumentsList = ['draft', 'final'].map(phase =>
        ` ${path.join(apiConfig.rootDir, `src/jobs/run-${phase}-job.mjs`)} ${jobId}`);
    return processSnapshot().filter(worker => {
        if (worker.state.startsWith('Z')) return false;
        return argumentsList.some(args => worker.command.endsWith(args)
            && /^node(?:\.exe)?$/.test(path.basename(worker.command.slice(0, -args.length))));
    });
}

export function startJobProcess(jobId, script, cwd) {
    if (hasJobProcess(jobId)) throw new Error('Project is already processing');
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
    const recovered = process.platform === 'win32' ? [] : recoverWorkers(jobId);
    const workers = [...recovered];
    if (job && !workers.some(worker => worker.pid === job.child.pid)) {
        workers.push({ pid: job.child.pid, group: job.child.pid });
    }
    for (const worker of workers) {
        if (!worker.pid) continue;
        if (worker.group !== worker.pid) throw new Error('Cannot safely stop a worker that does not own its process group.');
        // Detached workers and their FFmpeg children share this process group.
        try {
            if (process.platform === 'win32') job.child.kill('SIGKILL');
            else process.kill(-worker.pid, 'SIGKILL');
        } catch (error) {
            if (error.code !== 'ESRCH') throw error;
        }
    }
    if (job) await job.done;
    if (workers.length && process.platform !== 'win32') {
        const groups = new Set(workers.map(worker => worker.group));
        const deadline = Date.now() + 5000;
        while (processSnapshot().some(worker => groups.has(worker.group) && !worker.state.startsWith('Z'))) {
            if (Date.now() >= deadline) throw new Error('Worker shutdown is still in progress. Try again shortly.');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}

export function hasJobProcess(jobId) {
    return jobs.has(jobId) || (process.platform !== 'win32' && recoverWorkers(jobId).length > 0);
}
