import OpenAI from "openai";

export function createOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
    return new OpenAI({
        apiKey,
        // A network failure used to leave the HTTP request pending for the SDK's
        // long default timeout, making a draft appear stuck in "planning".
        timeout: 90_000,
        maxRetries: 2
    });
}
