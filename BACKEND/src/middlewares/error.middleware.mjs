export function notFoundMiddleware(_req, res) {
    res.status(404).json({ error: "Route not found" });
}

export function errorMiddleware(err, _req, res, _next) {
    let message = err?.message || "Internal server error";
    if (err?.name === "MulterError" && err?.code === "LIMIT_UNEXPECTED_FILE") {
        if (err?.field === "reference") {
            message = "Too many reference images. Maximum allowed is 100.";
        } else {
            message = `Unexpected upload field: ${String(err?.field || "unknown")}`;
        }
    }
    const status = err?.statusCode || 500;
    res.status(status).json({ error: message });
}
