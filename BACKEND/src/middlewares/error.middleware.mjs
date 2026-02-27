export function notFoundMiddleware(_req, res) {
    res.status(404).json({ error: "Route not found" });
}

export function errorMiddleware(err, _req, res, _next) {
    const message = err?.message || "Internal server error";
    const status = err?.statusCode || 500;
    res.status(status).json({ error: message });
}

