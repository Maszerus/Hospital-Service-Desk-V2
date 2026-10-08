const express = require("express");
const session = require("express-session");
const { randomBytes, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
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
const {
  database,
  initializeDatabase,
  normalizeSearch,
  ticketQuery,
  findTicketById,
  setAgentPasswords,
  verifyPassword,
} = require("./database");

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
initializeDatabase();
setAgentPasswords(demoPassword);
const xssHandler = "alert('LAB XSS: nieszkodliwy komunikat demonstracyjny.')";
const xssDescription =
  '<img src="/lab/xss-demo-missing-image" ' +
  `alt="Demonstracja XSS" onerror="${xssHandler}">`;
const xssHash = createHash("sha256").update(xssHandler).digest("base64");
let labTicketId = null;
if (labEnabled) {
  const existing = database
    .prepare("SELECT id FROM tickets WHERE title = ? AND description = ?")
    .get("LAB: kontrolowany przykład XSS", xssDescription);
  if (existing) {
    labTicketId = existing.id;
  } else {
    const reporter = database
      .prepare("SELECT id FROM employees ORDER BY id LIMIT 1")
      .get();
    const result = database
      .prepare(
        `
      INSERT INTO tickets (title, description, priority, status, reporter_id, created_at)
      VALUES (?, ?, 'low', 'new', ?, ?)
    `,
      )
      .run(
        "LAB: kontrolowany przykład XSS",
        xssDescription,
        reporter.id,
        new Date().toISOString(),
      );
    labTicketId = Number(result.lastInsertRowid);
  }
}

function isLabBefore(request) {
  return labEnabled && request.session?.labVariant === "BEFORE";
}

function presentTicket(request, ticket) {
  return {
    ...ticket,
    descriptionRendering:
      isLabBefore(request) &&
      ticket.id === labTicketId &&
      ticket.description === xssDescription
        ? "html"
        : "text",
  };
}

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  if (request.get("host") !== `127.0.0.1:${port}`) {
    return response.status(403).json({ message: "Użyj adresu 127.0.0.1." });
  }
  response.set("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(
  "/api/tickets/:id/status",
  express.urlencoded({ extended: false, limit: "1kb" }),
);
app.use(
  session({
    name: "medidesk.sid",
    secret: randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: Boolean(tlsOptions),
      maxAge: 3600000,
    },
  }),
);
app.use((request, response, next) => {
  const controlledHandler =
    isLabBefore(request) && request.path === "/ticket-details.html"
      ? ` 'unsafe-hashes' 'sha256-${xssHash}'`
      : "";
  response.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self'${controlledHandler}`,
      "style-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  response.set("Cache-Control", "no-store");
  next();
});

function getCsrfToken(request) {
  if (!request.session.csrfToken) {
    request.session.csrfToken = randomBytes(32).toString("hex");
  }
  return request.session.csrfToken;
}

app.use("/api", (request, response, next) => {
  response.set("Cache-Control", "no-store");
  if (["GET", "HEAD"].includes(request.method)) {
    return next();
  }
  const isStatusChange =
    ["POST", "PATCH"].includes(request.method) &&
    /^\/tickets\/\d+\/status$/.test(request.path);
  const bypassCsrf = isStatusChange && isLabBefore(request);
  const isLabStatusForm =
    labEnabled &&
    isStatusChange &&
    request.is("application/x-www-form-urlencoded");
  const token =
    request.get("X-CSRF-Token") ||
    (isLabStatusForm ? request.body?.csrfToken : undefined);
  if (!bypassCsrf && (!token || token !== request.session.csrfToken)) {
    return response
      .status(403)
      .json({ message: "Niepoprawny token CSRF. Odśwież stronę." });
  }
  if (
    !bypassCsrf &&
    request.get("origin") &&
    request.get("origin") !== origin
  ) {
    return response
      .status(403)
      .json({ message: "Niedozwolone źródło żądania." });
  }
  if (!request.is("application/json") && !isLabStatusForm) {
    return response.status(415).json({ message: "Wymagany jest format JSON." });
  }
  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    return response
      .status(400)
      .json({ message: "Niepoprawne dane formularza." });
  }
  next();
});

function requireSession(request, response, next) {
  if (!request.session.agent) {
    return response
      .status(401)
      .json({ message: "Zaloguj się do demonstracji." });
  }
  next();
}

function isValidId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

app.get("/api/session", (request, response) => {
  response.json({
    agent: request.session.agent || null,
    csrfToken: getCsrfToken(request),
    lab: {
      enabled: labEnabled,
      variant: isLabBefore(request) ? "BEFORE" : "AFTER",
      ticketId: labTicketId,
    },
  });
});

app.post("/api/lab/mode", requireSession, (request, response, next) => {
  if (!labEnabled)
    return response
      .status(403)
      .json({ message: "Laboratorium jest wyłączone." });
  const { variant } = request.body;
  if (!["BEFORE", "AFTER"].includes(variant)) {
    return response.status(400).json({ message: "Wybierz BEFORE lub AFTER." });
  }
  request.session.labVariant = variant;
  request.session.save((error) => {
    if (error) return next(error);
    response.json({ variant });
  });
});

app.post("/api/login", (request, response, next) => {
  const { email, password } = request.body;
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof password !== "string" ||
    !password.trim() ||
    password.length > 200
  ) {
    return response
      .status(400)
      .json({ message: "Podaj e-mail i hasło demonstracyjne." });
  }
  const account = database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName, email,
      password_hash AS passwordHash FROM agents WHERE email = ?
  `,
    )
    .get(email.trim().toLowerCase());
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return response
      .status(401)
      .json({ message: "Niepoprawny e-mail lub hasło." });
  }
  const { passwordHash, ...agent } = account;
  request.session.regenerate((error) => {
    if (error) return next(error);
    request.session.agent = agent;
    const csrfToken = getCsrfToken(request);
    request.session.save((saveError) => {
      if (saveError) return next(saveError);
      response.json({
        agent,
        csrfToken,
        message: "Zalogowano do demonstracji.",
      });
    });
  });
});

app.post("/api/logout", requireSession, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("medidesk.sid", {
      httpOnly: true,
      sameSite: "strict",
      secure: Boolean(tlsOptions),
    });
    response.json({ message: "Wylogowano." });
  });
});

app.get("/api/employees", requireSession, (request, response) => {
  const search = request.query.search ?? "";
  if (typeof search !== "string" || search.length > 100) {
    return response
      .status(400)
      .json({ message: "Wyszukiwanie może mieć do 100 znaków." });
  }
  const employees = database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName,
      employee_number AS employeeNumber
    FROM employees WHERE instr(search_key, ?) > 0 ORDER BY id
  `,
    )
    .all(normalizeSearch(search));
  response.json(employees);
});

app.get("/api/agents", requireSession, (request, response) => {
  response.json(
    database
      .prepare(
        `
    SELECT id, first_name AS firstName, last_name AS lastName, email
    FROM agents ORDER BY id
  `,
      )
      .all(),
  );
});

app.get("/api/tickets", requireSession, (request, response) => {
  response.json(
    database.prepare(`${ticketQuery} ORDER BY tickets.id DESC`).all(),
  );
});

app.get("/api/tickets/:id", requireSession, (request, response) => {
  const id = Number(request.params.id);
  if (!isValidId(id))
    return response
      .status(400)
      .json({ message: "Niepoprawny numer zgłoszenia." });
  const ticket = findTicketById(id);
  if (!ticket)
    return response.status(404).json({ message: "Nie znaleziono zgłoszenia." });
  response.json(presentTicket(request, ticket));
});

app.post("/api/tickets", requireSession, (request, response) => {
  const {
    title,
    description,
    priority,
    reporterId,
    agentId = null,
  } = request.body;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 120 ||
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 5000 ||
    !["low", "medium", "high"].includes(priority) ||
    !isValidId(reporterId) ||
    (agentId !== null && !isValidId(agentId))
  ) {
    return response.status(400).json({
      message:
        "Podaj tytuł (1–120 znaków), opis (1–5000 znaków), priorytet i zgłaszającego.",
    });
  }
  if (
    !database.prepare("SELECT id FROM employees WHERE id = ?").get(reporterId)
  ) {
    return response
      .status(400)
      .json({ message: "Wybierz istniejącego fikcyjnego pracownika." });
  }
  if (
    agentId !== null &&
    !database.prepare("SELECT id FROM agents WHERE id = ?").get(agentId)
  ) {
    return response
      .status(400)
      .json({ message: "Wybierz istniejącego agenta Service Desku." });
  }
  const result = database
    .prepare(
      `
    INSERT INTO tickets
      (title, description, priority, status, reporter_id, agent_id, created_at)
    VALUES (?, ?, ?, 'new', ?, ?, ?)
  `,
    )
    .run(
      title.trim(),
      description.trim(),
      priority,
      reporterId,
      agentId,
      new Date().toISOString(),
    );
  response.status(201).json(findTicketById(Number(result.lastInsertRowid)));
});

function changeTicketStatus(request, response) {
  const id = Number(request.params.id);
  const { status } = request.body;
  if (!isValidId(id) || !["new", "progress", "closed"].includes(status)) {
    return response
      .status(400)
      .json({ message: "Podaj poprawny numer i status zgłoszenia." });
  }
  const result = database
    .prepare("UPDATE tickets SET status = ? WHERE id = ?")
    .run(status, id);
  if (!result.changes)
    return response.status(404).json({ message: "Nie znaleziono zgłoszenia." });
  response.json(presentTicket(request, findTicketById(id)));
}
app.patch("/api/tickets/:id/status", requireSession, changeTicketStatus);
app.post("/api/tickets/:id/status", requireSession, changeTicketStatus);

app.delete("/api/tickets/:id", requireSession, (request, response) => {
  const id = Number(request.params.id);
  if (!isValidId(id)) {
    return response
      .status(400)
      .json({ message: "Niepoprawny numer zgłoszenia." });
  }
  const result = database
    .prepare("DELETE FROM tickets WHERE id = ? AND status = 'closed'")
    .run(id);
  if (!result.changes) {
    const ticket = findTicketById(id);
    return response.status(ticket ? 409 : 404).json({
      message: ticket
        ? "Można usunąć tylko zamknięte zgłoszenie."
        : "Nie znaleziono zgłoszenia.",
    });
  }
  response.json({ message: "Usunięto zamknięte zgłoszenie." });
});

app.use("/api", (request, response) => {
  response.status(404).json({ message: "Nie znaleziono endpointu." });
});
app.get("/", (request, response) => response.redirect("/login.html"));
app.use(express.static(path.join(__dirname, "public")));
app.use((request, response) =>
  response.status(404).send("Nie znaleziono strony."),
);
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  if (status === 500) console.error("Błąd serwera:", error.message);
  response.status(status).json({
    message:
      status === 500 ? "Błąd serwera." : "Niepoprawny lub zbyt duży JSON.",
  });
});

const server = tlsOptions
  ? https.createServer(tlsOptions, app)
  : http.createServer(app);
server.listen(port, host, () => {
  console.log(`MediDesk: ${origin}`);
  console.log("Konta agentów demonstracyjnych:");
  for (const agent of database
    .prepare("SELECT email FROM agents ORDER BY id")
    .all()) {
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
