import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
// Resolve from the project, not the terminal's working directory.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
