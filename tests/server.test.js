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
  };
  let server;
  let cookie = "";
  let token = "";

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

  async function login() {
    const session = await request("/api/session");
    token = session.data.csrfToken;
    const oldCookie = cookie;
    const result = await request("/api/login", "POST", {
      email: "demo01@example.invalid",
      password,
    });
    assert.equal(result.status, 200);
    assert.notEqual(cookie, oldCookie);
    assert.notEqual(result.data.csrfToken, token);
    assert.match(result.headers.get("set-cookie"), /HttpOnly/);
    assert.match(result.headers.get("set-cookie"), /SameSite=Strict/);
    token = result.data.csrfToken;
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
        email: "demo01@example.invalid",
        password: "incorrect-demo-password",
      })
    ).status,
    401,
  );
  await login();
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
    stored.prepare("SELECT status FROM tickets WHERE id = ?").get(id).status,
    "closed",
  );
  stored.close();
  await startServer();
  assert.equal((await request("/api/tickets")).status, 401);
  await login();
  assert.equal((await request(`/api/tickets/${id}`)).data.status, "closed");
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
});
