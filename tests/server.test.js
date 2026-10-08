const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { mkdtempSync, rmSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const { tmpdir } = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { DatabaseSync } = require("node:sqlite");

test("Lokalna sesja, walidacja, CSRF i trwały zapis zgłoszenia", async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "medidesk-test-"));
  const databasePath = path.join(directory, "test.sqlite");
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(18).toString("hex");
  const environment = {
    ...process.env,
    PORT: String(port),
    MEDIDESK_DB_PATH: databasePath,
    MEDIDESK_DEMO_PASSWORD: password,
    LAB_MODE: "0",
    HOST: "127.0.0.1",
    MEDIDESK_TLS_CERT: "",
    MEDIDESK_TLS_KEY: "",
  };
  let server;
  let cookie = "";
  let token = "";
  delete environment.LAB_MODE;

  async function stopServer() {
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "exit");
      server.kill();
      await stopped;
    }
  }
  context.after(async () => {
    await stopServer();
    rmSync(directory, { recursive: true, force: true });
  });

  async function startServer() {
    server = spawn(process.execPath, ["server.js"], {
      cwd: path.join(__dirname, ".."),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Serwer nie wystartował.")),
        10000,
      );
      server.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      server.once("exit", () => {
        clearTimeout(timer);
        reject(new Error(output));
      });
      server.stderr.on("data", (data) => {
        output += data;
      });
      server.stdout.on("data", (data) => {
        output += data;
        if (output.includes(`MediDesk: ${origin}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  async function request(url, method = "GET", body, headers = {}) {
    const response = await fetch(`${origin}${url}`, {
      method,
      headers: {
        Cookie: cookie,
        ...(method === "GET"
          ? {}
          : {
              "Content-Type": "application/json",
              "X-CSRF-Token": token,
            }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sessionCookie = response.headers.get("set-cookie");
    if (sessionCookie) cookie = sessionCookie.split(";")[0];
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  }

  async function login(email = "p.rozmanowski@jakotako.com") {
    const session = await request("/api/session");
    token = session.data.csrfToken;
    const oldCookie = cookie;
    const result = await request("/api/login", "POST", {
      email,
      password,
    });
    assert.equal(result.status, 200);
    assert.notEqual(cookie, oldCookie);
    assert.notEqual(result.data.csrfToken, token);
    assert.match(result.headers.get("set-cookie"), /HttpOnly/);
    assert.match(result.headers.get("set-cookie"), /SameSite=Strict/);
    token = result.data.csrfToken;
    return result.data.agent;
  }

  await startServer();
  const html = await fetch(`${origin}/login.html`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /MediDesk/);
  assert.equal((await fetch(`${origin}/data/medidesk.sqlite`)).status, 404);
  assert.equal((await request("/api/tickets")).status, 401);
  token = (await request("/api/session")).data.csrfToken;
  assert.equal(
    (
      await request("/api/login", "POST", {
        email: "p.rozmanowski@jakotako.com",
        password: "incorrect-demo-password",
      })
    ).status,
    401,
  );
  await login();
  const agents = (await request("/api/agents")).data;
  assert.equal(agents.length, 4);
  assert.deepEqual(
    agents.map((agent) => agent.email),
    [
      "p.rozmanowski@jakotako.com",
      "j.malina@jakotako.com",
      "d.pejs@jakotako.com",
      "a.szymczyk@jakotako.com",
    ],
  );
  assert.ok(agents.every((agent) => !("passwordHash" in agent)));
  for (const agent of agents) {
    await context.test(`Logowanie agenta ${agent.email}`, async () => {
      const loggedIn = await login(agent.email);
      assert.equal(loggedIn.id, agent.id);
      assert.equal(loggedIn.email, agent.email);
      assert.equal(loggedIn.firstName, agent.firstName);
      assert.ok(!("passwordHash" in loggedIn));
      assert.equal((await request("/api/session")).data.agent.id, agent.id);
      assert.equal(
        (
          await request("/api/login", "POST", {
            email: agent.email,
            password: "incorrect-demo-password",
          })
        ).status,
        401,
      );
    });
  }
  assert.equal(
    (
      await request("/api/login", "POST", {
        email: "demo01@example.invalid",
        password,
      })
    ).status,
    401,
  );
  const reporters = (await request("/api/employees")).data;
  assert.equal(reporters.length, 3);
  assert.deepEqual(
    reporters.map((reporter) => reporter.lastName),
    ["Przykładowa", "Testowy", "Fikcyjna"],
  );
  assert.equal((await request("/api/session")).data.lab.enabled, false);
  assert.equal(
    (await request("/api/lab/mode", "POST", { variant: "BEFORE" })).status,
    403,
  );
  assert.equal((await request("/api/tickets")).data.length, 3);
  for (const query of ["przykladowa", "DEMO-001", "ALICJA"]) {
    const result = await request(`/api/employees?search=${query}`);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].employeeNumber, "DEMO-001");
  }
  assert.deepEqual(
    (await request("/api/employees?search=%27%20OR%201%3D1--")).data,
    [],
  );
  const ticketData = {
    title: "Fikcyjne zgłoszenie testowe",
    description: "Opis fikcyjnej awarii.",
    priority: "high",
    reporterId: 1,
    agentId: agents[1].id,
  };
  assert.equal(
    (await request("/api/tickets", "POST", ticketData, { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/api/tickets", "POST", ticketData, {
        Origin: "http://example.invalid",
      })
    ).status,
    403,
  );
  for (const changes of [
    { title: " " },
    { title: "a".repeat(121) },
    { description: "" },
    { description: "a".repeat(5001) },
    { priority: "urgent" },
    { reporterId: 999 },
    { reporterId: "1" },
    { title: ["test"] },
    { agentId: 999 },
    { agentId: "1" },
    { agentId: 0 },
  ]) {
    assert.equal(
      (await request("/api/tickets", "POST", { ...ticketData, ...changes }))
        .status,
      400,
    );
  }
  assert.equal((await request("/api/tickets")).data.length, 3);
  const created = await request("/api/tickets", "POST", ticketData);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.status, "new");
  assert.equal(created.data.agentId, agents[1].id);
  assert.equal(created.data.agentName, "Jaromir Malina");
  assert.equal(
    (await request(`/api/tickets/${id}`)).data.title,
    ticketData.title,
  );
  assert.equal(
    (await request(`/api/tickets/${id}/status`, "PATCH", { status: "invalid" }))
      .status,
    400,
  );
  assert.equal(
    (await request(`/api/tickets/${id}/status`, "PATCH", { status: "closed" }))
      .data.status,
    "closed",
  );
  assert.equal((await request("/api/tickets/99999")).status, 404);
  assert.equal((await request("/api/tickets/bad-id")).status, 400);

  await stopServer();
  const stored = new DatabaseSync(databasePath);
  assert.equal(
    stored.prepare("SELECT agent_id FROM tickets WHERE id = ?").get(id)
      .agent_id,
    agents[1].id,
  );
  const hashes = stored
    .prepare("SELECT password_hash FROM agents ORDER BY id")
    .all();
  assert.equal(new Set(hashes.map((agent) => agent.password_hash)).size, 4);
  for (const agent of hashes) {
    assert.match(agent.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(agent.password_hash, password);
    assert.ok(!agent.password_hash.includes(password));
  }
  assert.equal(
    stored.prepare("SELECT status FROM tickets WHERE id = ?").get(id).status,
    "closed",
  );
  stored.close();
  await startServer();
  assert.equal((await request("/api/tickets")).status, 401);
  await login();
  assert.equal((await request(`/api/tickets/${id}`)).data.status, "closed");
  assert.equal(
    (await request(`/api/tickets/${id}`)).data.agentName,
    "Jaromir Malina",
  );
  assert.equal((await request("/api/logout", "POST", {})).status, 200);
  assert.equal((await request("/api/tickets")).status, 401);
  await stopServer();
  const reset = spawnSync(process.execPath, ["scripts/init-db.js", "--reset"], {
    cwd: path.join(__dirname, ".."),
    env: environment,
    windowsHide: true,
  });
  assert.equal(reset.status, 0, reset.stderr.toString());
  const resetDatabase = new DatabaseSync(databasePath);
  assert.equal(
    resetDatabase.prepare("SELECT count(*) AS count FROM tickets").get().count,
    3,
  );
  resetDatabase.close();
  const initializedAgain = spawnSync(process.execPath, ["scripts/init-db.js"], {
    cwd: path.join(__dirname, ".."),
    env: environment,
    windowsHide: true,
  });
  assert.equal(initializedAgain.status, 0);
  const seeded = new DatabaseSync(databasePath);
  assert.equal(
    seeded.prepare("SELECT count(*) AS count FROM agents").get().count,
    4,
  );
  assert.equal(
    seeded.prepare("SELECT count(*) AS count FROM employees").get().count,
    3,
  );
  assert.equal(
    seeded.prepare("SELECT count(*) AS count FROM tickets").get().count,
    3,
  );
  seeded.close();

  for (const script of ["server.js", "lab/csrf-server.js"]) {
    for (const host of ["0.0.0.0", "::1", "localhost"]) {
      const refused = spawnSync(process.execPath, [script], {
        cwd: path.join(__dirname, ".."),
        env: { ...environment, LAB_MODE: "1", HOST: host },
        windowsHide: true,
        timeout: 2000,
      });
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr.toString(), /127\.0\.0\.1/);
    }
  }

  environment.LAB_MODE = "1";
  await startServer();
  await login();
  const labSession = (await request("/api/session")).data;
  assert.equal(labSession.lab.variant, "AFTER");
  await context.test("Cykl sesji i tokenu CSRF w LAB: AFTER", async () => {
    const previousToken = token;
    const previousCookie = cookie;
    assert.match(previousToken, /^[a-f0-9]{64}$/);
    for (let refresh = 0; refresh < 3; refresh += 1) {
      const session = await request("/api/session");
      assert.equal(session.data.csrfToken, previousToken);
      assert.match(session.headers.get("cache-control"), /no-store/);
      const page = await fetch(`${origin}/dashboard.html`, {
        headers: { Cookie: cookie },
      });
      assert.equal(page.status, 200);
      assert.match(page.headers.get("cache-control"), /no-store/);
      assert.equal((await request("/api/tickets")).status, 200);
    }
    const independent = await request("/api/session", "GET", undefined, {
      Cookie: "",
    });
    assert.match(independent.data.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(independent.data.csrfToken, previousToken);
    assert.notEqual(cookie, previousCookie);
    cookie = previousCookie;
    const logout = await request("/api/logout", "POST", {});
    assert.equal(logout.status, 200);
    const clearedCookie = logout.headers.get("set-cookie");
    assert.match(clearedCookie, /^medidesk\.sid=;/);
    assert.match(clearedCookie, /Path=\//);
    assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970/);
    assert.match(clearedCookie, /HttpOnly/);
    assert.match(clearedCookie, /SameSite=Strict/);
    assert.equal((await request("/api/tickets")).status, 401);
    assert.equal(
      (
        await request("/api/tickets", "GET", undefined, {
          Cookie: previousCookie,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/api/tickets/1/status",
          "PATCH",
          { status: "closed" },
          {
            Cookie: previousCookie,
            "X-CSRF-Token": previousToken,
          },
        )
      ).status,
      403,
    );
    const anonymous = await request("/api/session");
    const anonymousCookie = cookie;
    token = anonymous.data.csrfToken;
    assert.equal(anonymous.data.agent, null);
    assert.notEqual(token, previousToken);
    assert.notEqual(cookie, previousCookie);
    assert.equal(
      (await request("/api/tickets/1/status", "PATCH", { status: "closed" }))
        .status,
      401,
    );
    await login();
    assert.notEqual(token, previousToken);
    assert.notEqual(token, anonymous.data.csrfToken);
    assert.notEqual(cookie, previousCookie);
    assert.notEqual(cookie, anonymousCookie);
    assert.equal((await request("/api/session")).data.csrfToken, token);
    for (const oldToken of [previousToken, anonymous.data.csrfToken]) {
      assert.equal(
        (
          await request(
            "/api/tickets/1/status",
            "PATCH",
            { status: "closed" },
            {
              "X-CSRF-Token": oldToken,
            },
          )
        ).status,
        403,
      );
      assert.equal((await request("/api/tickets/1")).data.status, "progress");
    }
    assert.equal(
      (await request("/api/tickets/1/status", "PATCH", { status: "closed" }))
        .status,
      200,
    );
    assert.equal((await request("/api/tickets/1")).data.status, "closed");
    await request("/api/tickets/1/status", "PATCH", { status: "progress" });
    assert.equal((await request("/api/session")).data.csrfToken, token);
  });
  const labId = labSession.lab.ticketId;
  assert.equal(
    (await request("/api/session?variant=BEFORE")).data.lab.variant,
    "AFTER",
  );
  assert.equal(
    (await request(`/api/tickets/${labId}`)).data.descriptionRendering,
    "text",
  );
  assert.equal(
    (await request("/api/lab/mode", "POST", { variant: "invalid" })).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/lab/mode",
        "POST",
        { variant: "BEFORE" },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/lab/mode", "POST", { variant: "BEFORE" })).status,
    200,
  );
  const demoTicket = (await request(`/api/tickets/${labId}`)).data;
  assert.equal(demoTicket.descriptionRendering, "html");
  assert.match(demoTicket.description, /nieszkodliwy komunikat/);
  assert.match(
    (
      await fetch(`${origin}/ticket-details.html`, {
        headers: { Cookie: cookie },
      })
    ).headers.get("content-security-policy"),
    /unsafe-hashes/,
  );
  assert.equal(
    (await request("/api/tickets", "POST", ticketData, { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  const arbitrary = await request("/api/tickets", "POST", {
    ...ticketData,
    description: "<b>Fikcyjny tekst</b>",
  });
  assert.equal(
    (await request(`/api/tickets/${arbitrary.data.id}`)).data
      .descriptionRendering,
    "text",
  );

  async function submitCrossOriginStatus(status, invalidToken = false) {
    return fetch(`${origin}/api/tickets/1/status`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: `http://127.0.0.1:${port + 1}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `status=${status}${invalidToken ? "&csrfToken=invalid-lab-token" : ""}`,
    });
  }
  assert.equal((await submitCrossOriginStatus("closed")).status, 200);
  assert.equal((await request("/api/tickets/1")).data.status, "closed");
  assert.equal((await submitCrossOriginStatus("invalid")).status, 400);
  assert.equal((await request("/api/tickets/1")).data.status, "closed");
  assert.equal(
    (await request("/api/tickets/1/status?status=new&variant=AFTER")).status,
    404,
  );
  assert.equal((await request("/api/tickets/1")).data.status, "closed");
  assert.equal(
    (await request("/api/session?variant=AFTER")).data.lab.variant,
    "BEFORE",
  );
  await request("/api/tickets/1/status", "PATCH", { status: "progress" });
  assert.equal((await request("/api/tickets/1")).data.status, "progress");
  assert.equal((await submitCrossOriginStatus("closed", true)).status, 200);
  await request("/api/tickets/1/status", "PATCH", { status: "progress" });
  await request("/api/lab/mode", "POST", { variant: "AFTER" });
  assert.equal(
    (await request(`/api/tickets/${labId}`)).data.descriptionRendering,
    "text",
  );
  assert.equal((await submitCrossOriginStatus("new")).status, 403);
  assert.equal((await request("/api/tickets/1")).data.status, "progress");
  assert.equal((await submitCrossOriginStatus("new", true)).status, 403);
  assert.equal((await request("/api/tickets/1")).data.status, "progress");
  for (const badToken of ["", "invalid-lab-token"]) {
    assert.equal(
      (
        await request(
          "/api/tickets/1/status",
          "PATCH",
          { status: "closed" },
          { "X-CSRF-Token": badToken },
        )
      ).status,
      403,
    );
    assert.equal((await request("/api/tickets/1")).data.status, "progress");
  }
  assert.equal(
    (await request(`/api/tickets/${labId}?variant=BEFORE`)).data
      .descriptionRendering,
    "text",
  );
  assert.equal(
    (await request(`/api/tickets/${arbitrary.data.id}`)).data
      .descriptionRendering,
    "text",
  );
  assert.equal(
    (await request("/api/tickets/1/status", "PATCH", { status: "new" })).status,
    200,
  );
  assert.equal((await request("/api/tickets/1")).data.status, "new");
  await request("/api/tickets/1/status", "PATCH", { status: "progress" });
  assert.equal((await request("/api/tickets/1")).data.status, "progress");
  assert.doesNotMatch(
    (
      await fetch(`${origin}/ticket-details.html`, {
        headers: { Cookie: cookie },
      })
    ).headers.get("content-security-policy"),
    /unsafe-hashes/,
  );
  for (const variant of ["BEFORE", "AFTER"]) {
    await context.test(
      `Usuwanie zamkniętych zgłoszeń w ${variant}`,
      async () => {
        await request("/api/lab/mode", "POST", { variant });
        const created = await request("/api/tickets", "POST", ticketData);
        assert.equal(created.status, 201);
        const url = `/api/tickets/${created.data.id}`;
        for (const status of ["new", "progress"]) {
          await request(`${url}/status`, "PATCH", { status });
          assert.equal((await request(url, "DELETE", {})).status, 409);
          assert.equal((await request(url)).data.status, status);
        }
        await request(`${url}/status`, "PATCH", { status: "closed" });
        for (const badToken of ["", "invalid-lab-token"]) {
          assert.equal(
            (await request(url, "DELETE", {}, { "X-CSRF-Token": badToken }))
              .status,
            403,
          );
          assert.equal((await request(url)).data.status, "closed");
        }
        assert.equal((await request(`${url}?delete=1`)).status, 200);
        assert.equal((await request(url)).data.status, "closed");
        assert.equal(
          (
            await request(
              url,
              "DELETE",
              {},
              { Origin: "http://127.0.0.1:3001" },
            )
          ).status,
          403,
        );
        const count = (await request("/api/tickets")).data.length;
        assert.equal((await request(url, "DELETE", {})).status, 200);
        assert.equal((await request(url)).status, 404);
        const remaining = (await request("/api/tickets")).data;
        assert.equal(remaining.length, count - 1);
        assert.ok(!remaining.some((ticket) => ticket.id === created.data.id));
        assert.equal((await request(url, "DELETE", {})).status, 404);
        assert.equal(
          (await request("/api/tickets/bad-id", "DELETE", {})).status,
          400,
        );
      },
    );
  }
  await stopServer();
  delete environment.LAB_MODE;
  await startServer();
  await login();
  assert.equal((await request("/api/session")).data.lab.enabled, false);
  assert.equal(
    (await request(`/api/tickets/${labId}?variant=BEFORE`)).data
      .descriptionRendering,
    "text",
  );
  assert.equal(
    (await request("/api/lab/mode", "POST", { variant: "BEFORE" })).status,
    403,
  );
  assert.equal((await submitCrossOriginStatus("closed")).status, 403);
  assert.equal((await request("/api/tickets/1")).data.status, "progress");
  await stopServer();
});

test("Migracja starej bazy zachowuje zgłaszającego i zgłoszenie", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "medidesk-migration-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT,
      employee_number TEXT UNIQUE, email TEXT UNIQUE, search_key TEXT
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY, title TEXT, description TEXT, priority TEXT,
      status TEXT, reporter_id INTEGER REFERENCES employees(id), created_at TEXT
    );
    INSERT INTO employees VALUES
      (1, 'Osoba', 'Fikcyjna', 'DEMO-099', 'legacy@example.invalid', 'osoba fikcyjna demo-099');
    INSERT INTO tickets VALUES
      (7, 'Fikcyjne starsze zgłoszenie', 'Opis demonstracyjny', 'low', 'new', 1, '2026-10-08');
  `);
  legacy.close();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const migration = spawnSync(process.execPath, ["scripts/init-db.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, MEDIDESK_DB_PATH: databasePath },
      windowsHide: true,
    });
    assert.equal(migration.status, 0, migration.stderr.toString());
    const migrated = new DatabaseSync(databasePath);
    const ticket = migrated.prepare("SELECT * FROM tickets WHERE id = 7").get();
    assert.equal(ticket.title, "Fikcyjne starsze zgłoszenie");
    assert.equal(ticket.reporter_id, 1);
    assert.equal(ticket.agent_id, null);
    assert.equal(
      migrated.prepare("SELECT email FROM employees WHERE id = 1").get().email,
      "legacy@example.invalid",
    );
    assert.equal(
      migrated.prepare("SELECT count(*) AS count FROM tickets").get().count,
      1,
    );
    assert.equal(
      migrated.prepare("SELECT count(*) AS count FROM agents").get().count,
      4,
    );
    assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    migrated.close();
  }
});
