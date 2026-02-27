import cors from "cors";
import express from "express";
import { ensureInfrastructure } from "./services/job-store.service.mjs";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/error.middleware.mjs";
import apiRoutes from "./routes/index.mjs";

export function createApp() {
    ensureInfrastructure();

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));

    app.use("/api", apiRoutes);
    app.use(notFoundMiddleware);
    app.use(errorMiddleware);

    return app;
}
