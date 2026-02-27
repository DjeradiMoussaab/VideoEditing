import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export const apiConfig = {
    port: Number(process.env.PORT ?? 8080),
    rootDir: ROOT_DIR,
    uploadsDir: path.join(ROOT_DIR, "uploads"),
    jobsDir: path.join(ROOT_DIR, "out", "jobs")
};

