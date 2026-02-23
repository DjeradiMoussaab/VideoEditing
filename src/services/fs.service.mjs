import fs from "fs";

export function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

export function exists(p) {
    return fs.existsSync(p);
}

export function readText(p) {
    return fs.readFileSync(p, "utf8");
}

export function readJson(p) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeText(p, txt) {
    fs.writeFileSync(p, txt);
}

export function writeJson(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}