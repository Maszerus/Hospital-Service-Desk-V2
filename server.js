const {
  labEnabled,
  host,
  port,
  origin,
  tlsOptions,
  demoPassword,
} = require("./config/server");
const express = require("express");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { database } = require("./database");
const { initializeDatabase } = require("./services/demoService");
const { setAgentPasswords, listAgents } = require("./services/peopleService");
const { initializeLab, setSecurityHeaders } = require("./middleware/lab");
const {
  requireLocalHost,
  sessionMiddleware,
  protectApi,
} = require("./middleware/security");
const {
  apiNotFound,
  pageNotFound,
  handleError,
} = require("./middleware/errors");
const apiRoutes = require("./routes/apiRoutes");

initializeDatabase();
setAgentPasswords(demoPassword);
initializeLab();
const app = express();
app.disable("x-powered-by");
app.use(requireLocalHost);
app.use(express.json({ limit: "16kb" }));
app.use(
  "/api/tickets/:id/status",
  express.urlencoded({ extended: false, limit: "1kb" }),
);
app.use(sessionMiddleware);
app.use(setSecurityHeaders);
app.use("/api", protectApi, apiRoutes, apiNotFound);
app.get("/", (request, response) => response.redirect("/login.html"));
app.use(express.static(path.join(__dirname, "public")));
app.use(pageNotFound);
app.use(handleError);
const server = tlsOptions
  ? https.createServer(tlsOptions, app)
  : http.createServer(app);
server.listen(port, host, () => {
  console.log(`MediDesk: ${origin}`);
  console.log("Konta agentów demonstracyjnych:");
  for (const agent of listAgents()) {
    console.log(`  ${agent.email}`);
  }
  console.log(
    labEnabled
      ? "Laboratorium włączone; domyślnie LAB: AFTER."
      : "Laboratorium wyłączone; wariant zabezpieczony.",
  );
  if (!process.env.MEDIDESK_DEMO_PASSWORD) {
    console.log(`Hasło na czas tego uruchomienia: ${demoPassword}`);
  }
});
server.on("error", (error) => {
  console.error("Nie można uruchomić serwera:", error.message);
  database.close();
  process.exitCode = 1;
});
function stopServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on("SIGINT", stopServer);
process.on("SIGTERM", stopServer);
