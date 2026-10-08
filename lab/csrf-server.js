const express = require("express");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");

if (
  process.env.LAB_MODE !== "1" ||
  (process.env.HOST || "127.0.0.1") !== "127.0.0.1"
) {
  throw new Error("Test wymaga LAB_MODE=1 i adresu 127.0.0.1.");
}
const port = Number(process.env.CSRF_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("CSRF_PORT musi być liczbą od 1 do 65535.");
}
const certificate = process.env.MEDIDESK_TLS_CERT;
const key = process.env.MEDIDESK_TLS_KEY;
if (Boolean(certificate) !== Boolean(key)) {
  throw new Error("Podaj certyfikat i klucz lokalnego HTTPS.");
}
const tlsOptions = certificate
  ? { cert: readFileSync(certificate), key: readFileSync(key) }
  : null;
const origin = `${tlsOptions ? "https" : "http"}://127.0.0.1:${port}`;
const target = new URL(
  process.env.MEDIDESK_TARGET_ORIGIN ||
    `${tlsOptions ? "https" : "http"}://127.0.0.1:3000`,
);
if (
  target.hostname !== "127.0.0.1" ||
  !["http:", "https:"].includes(target.protocol) ||
  target.username ||
  target.password ||
  target.pathname !== "/" ||
  target.search ||
  target.hash ||
  target.origin === origin ||
  target.protocol !== (tlsOptions ? "https:" : "http:")
) {
  throw new Error(
    "Cel musi być lokalnym originem 127.0.0.1 o innym porcie i tym samym protokole.",
  );
}
const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  if (request.get("host") !== `127.0.0.1:${port}`)
    return response.status(403).send("Użyj 127.0.0.1.");
  response.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action ${target.origin}`,
  );
  response.set("Cache-Control", "no-store");
  next();
});
app.get("/config", (request, response) =>
  response.json({ targetOrigin: target.origin }),
);
app.get("/", (request, response) =>
  response.sendFile(path.join(__dirname, "csrf.html")),
);
app.get("/csrf.js", (request, response) =>
  response.sendFile(path.join(__dirname, "csrf.js")),
);
app.get("/styles.css", (request, response) =>
  response.sendFile(path.join(__dirname, "../public/css/styles.css")),
);
const server = tlsOptions
  ? https.createServer(tlsOptions, app)
  : http.createServer(app);
server.listen(port, "127.0.0.1", () => console.log(`Test CSRF: ${origin}`));
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
