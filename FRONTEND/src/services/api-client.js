const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080/api";

export function toAbsoluteUrl(url, query = {}) {
  if (!url) return null;
  const absolute = /^https?:\/\//i.test(url)
    ? url
    : (() => {
        const base = API_BASE.replace(/\/api\/?$/, "");
        return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
      })();

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  if (!queryString) return absolute;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}${queryString}`;
}

export async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const fetchOptions = {
    ...options,
    cache: method === "GET" ? "no-store" : options.cache
  };
  const response = await fetch(`${API_BASE}${path}`, fetchOptions);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // Ignore parsing error.
    }
    throw new Error(message);
  }
  return response.json();
}
