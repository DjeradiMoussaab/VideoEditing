import "dotenv/config";
import { createContext } from "./context.mjs";
import { runPipeline } from "./pipeline/run-pipeline.mjs";

function parseArgs(argv) {
    const out = {
        useTestImages: false,
        testImagesDir: null,
        mockOpenAI: false,
        visualSource: null,
        prod: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--use-test-images") {
            out.useTestImages = true;
            continue;
        }

        if (arg === "--test-images-dir") {
            const next = argv[i + 1];
            if (!next || next.startsWith("--")) {
                throw new Error("Missing value for --test-images-dir");
            }
            out.testImagesDir = next;
            i += 1;
            continue;
        }

        if (arg === "--mock-openai") {
            out.mockOpenAI = true;
            continue;
        }

        if (arg === "--prod") {
            out.prod = true;
            continue;
        }

        if (arg === "--visual-source") {
            const next = argv[i + 1];
            if (!next || next.startsWith("--")) {
                throw new Error("Missing value for --visual-source");
            }
            out.visualSource = next;
            i += 1;
        }
    }

    if (out.prod && out.mockOpenAI) {
        throw new Error("Cannot use --prod with --mock-openai");
    }
    if (out.prod && out.testImagesDir) {
        throw new Error("Cannot use --prod with --test-images-dir");
    }

    if (out.prod) {
        out.useTestImages = false;
        out.mockOpenAI = false;
    }

    if (out.mockOpenAI) out.useTestImages = true;
    if (out.testImagesDir) out.useTestImages = true;

    return out;
}

const args = parseArgs(process.argv.slice(2));
const ctx = createContext(args);
runPipeline(ctx)
    .then((finalCtx) => {
        console.log("Done");
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
