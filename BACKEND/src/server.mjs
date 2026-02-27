import "dotenv/config";
import { createApp } from "./app.mjs";
import { apiConfig } from "./config/api.config.mjs";

const app = createApp();

app.listen(apiConfig.port, () => {
    console.log(`API listening on http://localhost:${apiConfig.port}`);
});
