const express = require("express");
const session = require("express-session");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const path = require("node:path");
const {
  database,
  initializeDatabase,
  normalizeSearch,
  ticketQuery,
  findTicketById,
} = require("./database");

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT musi być liczbą od 1 do 65535.");
}
const origin = `http://127.0.0.1:${port}`;
const demoPassword =
  process.env.MEDIDESK_DEMO_PASSWORD || randomBytes(18).toString("hex");
if (
  !demoPassword.trim() ||
  demoPassword.length < 12 ||
  demoPassword.length > 200
) {
  throw new Error("Hasło demonstracyjne musi mieć od 12 do 200 znaków.");
}
const passwordSalt = randomBytes(16);
const passwordHash = scryptSync(demoPassword, passwordSalt, 64);
initializeDatabase();

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  if (request.get("host") !== `127.0.0.1:${port}`) {
    return response.status(403).json({ message: "Użyj adresu 127.0.0.1." });
  }
  response.set("X-Content-Type-Options", "nosniff");
  response.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(
  session({
    name: "medidesk.sid",
    secret: randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      maxAge: 3600000,
    },
  }),
);

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
  if (request.get("origin") && request.get("origin") !== origin) {
    return response
      .status(403)
      .json({ message: "Niedozwolone źródło żądania." });
  }
  if (!request.is("application/json")) {
    return response.status(415).json({ message: "Wymagany jest format JSON." });
  }
  const token = request.get("X-CSRF-Token");
  if (!token || token !== request.session.csrfToken) {
    return response
      .status(403)
      .json({ message: "Niepoprawny token CSRF. Odśwież stronę." });
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
  if (!request.session.employee) {
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
    employee: request.session.employee || null,
    csrfToken: getCsrfToken(request),
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
  const matchesPassword = timingSafeEqual(
    scryptSync(password, passwordSalt, 64),
    passwordHash,
  );
  if (
    email.trim().toLowerCase() !== "demo01@example.invalid" ||
    !matchesPassword
  ) {
    return response
      .status(401)
      .json({ message: "Niepoprawny e-mail lub hasło." });
  }
  const employee = database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName, email
    FROM employees WHERE email = ?
  `,
    )
    .get("demo01@example.invalid");
  request.session.regenerate((error) => {
    if (error) return next(error);
    request.session.employee = employee;
    const csrfToken = getCsrfToken(request);
    request.session.save((saveError) => {
      if (saveError) return next(saveError);
      response.json({
        employee,
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
      secure: false,
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
  response.json(ticket);
});

app.post("/api/tickets", requireSession, (request, response) => {
  const { title, description, priority, reporterId } = request.body;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 120 ||
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 5000 ||
    !["low", "medium", "high"].includes(priority) ||
    !isValidId(reporterId)
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
  const result = database
    .prepare(
      `
    INSERT INTO tickets
      (title, description, priority, status, reporter_id, created_at)
    VALUES (?, ?, ?, 'new', ?, ?)
  `,
    )
    .run(
      title.trim(),
      description.trim(),
      priority,
      reporterId,
      new Date().toISOString(),
    );
  response.status(201).json(findTicketById(Number(result.lastInsertRowid)));
});

app.patch("/api/tickets/:id/status", requireSession, (request, response) => {
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
  response.json(findTicketById(id));
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

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`MediDesk: ${origin}`);
  console.log("Konto demonstracyjne: demo01@example.invalid");
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
