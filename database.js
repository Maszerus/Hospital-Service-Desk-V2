const { DatabaseSync } = require("node:sqlite");
const { mkdirSync } = require("node:fs");
const path = require("node:path");

const databasePath = path.resolve(
  process.env.MEDIDESK_DB_PATH ||
    path.join(__dirname, "data", "medidesk.sqlite"),
);
mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

function normalizeSearch(value) {
  return value
    .trim()
    .toLocaleLowerCase("pl")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function initializeDatabase(reset = false) {
  database.exec("BEGIN;");
  try {
    if (reset) {
      database.exec(
        "DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS employees;",
      );
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        employee_number TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        search_key TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
        description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 5000),
        priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK(status IN ('new', 'progress', 'closed')),
        reporter_id INTEGER NOT NULL REFERENCES employees(id),
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    if (
      database.prepare("SELECT count(*) AS count FROM employees").get()
        .count === 0
    ) {
      const insertEmployee = database.prepare(`
        INSERT INTO employees
          (first_name, last_name, employee_number, email, search_key)
        VALUES (?, ?, ?, ?, ?)
      `);
      const employees = [
        ["Alicja", "Przykładowa", "DEMO-001", "demo01@example.invalid"],
        ["Bartosz", "Testowy", "DEMO-002", "demo02@example.invalid"],
        ["Celina", "Fikcyjna", "DEMO-003", "demo03@example.invalid"],
      ];
      for (const employee of employees) {
        insertEmployee.run(
          ...employee,
          normalizeSearch(employee.slice(0, 3).join(" ")),
        );
      }
      const insertTicket = database.prepare(`
        INSERT INTO tickets
          (title, description, priority, status, reporter_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertTicket.run(
        "Drukarka nie drukuje",
        "Drukarka w pokoju Demo A nie drukuje strony testowej.",
        "high",
        "progress",
        1,
        "2026-10-08T09:00:00.000Z",
      );
      insertTicket.run(
        "Prośba o dostęp do folderu",
        "Prośba o dostęp do fikcyjnego folderu demonstracyjnego.",
        "medium",
        "new",
        2,
        "2026-10-08T08:00:00.000Z",
      );
      insertTicket.run(
        "Wymiana klawiatury",
        "Wymieniono klawiaturę na stanowisku Demo C.",
        "low",
        "closed",
        3,
        "2026-10-07T10:00:00.000Z",
      );
    }
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

const ticketQuery = `
  SELECT tickets.id, title, description, priority, status,
    reporter_id AS reporterId, created_at AS createdAt,
    first_name || ' ' || last_name AS reporterName,
    employee_number AS employeeNumber, email AS reporterEmail
  FROM tickets JOIN employees ON employees.id = tickets.reporter_id
`;

function findTicketById(id) {
  return database.prepare(`${ticketQuery} WHERE tickets.id = ?`).get(id);
}

module.exports = {
  database,
  databasePath,
  initializeDatabase,
  normalizeSearch,
  ticketQuery,
  findTicketById,
};
