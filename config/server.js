const { randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const labEnabled = process.env.LAB_MODE === "1";
const host = process.env.HOST || "127.0.0.1";
if (host !== "127.0.0.1") {
  throw new Error(
    labEnabled
      ? "Laboratorium może nasłuchiwać tylko na 127.0.0.1."
      : "Aplikacja może nasłuchiwać tylko na 127.0.0.1.",
  );
}
const tlsCertificate = process.env.MEDIDESK_TLS_CERT;
const tlsKey = process.env.MEDIDESK_TLS_KEY;
if (Boolean(tlsCertificate) !== Boolean(tlsKey)) {
  throw new Error("Podaj jednocześnie MEDIDESK_TLS_CERT i MEDIDESK_TLS_KEY.");
}
const tlsOptions = tlsCertificate
  ? {
      cert: readFileSync(tlsCertificate),
      key: readFileSync(tlsKey),
    }
  : null;
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT musi być liczbą od 1 do 65535.");
}
const origin = `${tlsOptions ? "https" : "http"}://127.0.0.1:${port}`;
const demoPassword =
  process.env.MEDIDESK_DEMO_PASSWORD || randomBytes(18).toString("hex");
if (
  !demoPassword.trim() ||
  demoPassword.length < 12 ||
  demoPassword.length > 200
) {
  throw new Error("Hasło demonstracyjne musi mieć od 12 do 200 znaków.");
}

module.exports = { labEnabled, host, port, origin, tlsOptions, demoPassword };
