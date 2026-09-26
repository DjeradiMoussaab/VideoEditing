export function notFoundMiddleware(_req, res) {
    res.status(404).json({ error: "Route not found" });
}

export function errorMiddleware(err, _req, res, _next) {
    let message = err?.message || "Internal server error";
    if (err?.name === "MulterError" && err?.code === "LIMIT_UNEXPECTED_FILE") {
        if (err?.field === "reference") {
            message = "Too many reference images. Maximum allowed is 100.";
        } else if (err?.field === "referenceClip") {
            message = "Too many reference clips. Maximum allowed is 30.";
        } else {
            message = `Unexpected upload field: ${String(err?.field || "unknown")}`;
        }
    }
    if (err?.name === "MulterError" && err?.code === "LIMIT_FILE_SIZE") message = "Each uploaded file must be 200 MB or smaller.";
    const status = err?.statusCode || (err?.name === "MulterError" ? 400 : 500);
    res.status(status).json({ error: message });
}
