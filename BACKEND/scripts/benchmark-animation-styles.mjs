import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Benchmark the actual production graph, not a separate approximation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const value = (flag, fallback) => {
    const index = process.argv.indexOf(flag);
    return index < 0 ? fallback : process.argv[index + 1];
};
const iterations = Math.max(1, Number(value('--iterations', 1)));
for (let i = 0; i < iterations; i++) {
    execFileSync(process.execPath, [path.join(root, 'scripts/render-motion-review.mjs'),
        value('--source', path.join(root, '../input/reference.jpg')),
        path.join(root, 'out/bench-animation', 'run-' + (i + 1))], {
        stdio: 'inherit', env: { ...process.env, REVIEW_WIDTH: '1920', REVIEW_DURATION: value('--duration', '4') }
    });
}
