const { database } = require("../database");

function initializeDatabase(reset, agents, employees) {
  database.exec("BEGIN;");
  try {
    if (reset) {
      database.exec(
        "DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS employees; DROP TABLE IF EXISTS agents;",
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
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
        description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 5000),
        priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK(status IN ('new', 'progress', 'closed')),
        reporter_id INTEGER NOT NULL REFERENCES employees(id),
        agent_id INTEGER REFERENCES agents(id),
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    if (
      !database
        .prepare("PRAGMA table_info(tickets)")
        .all()
        .some((column) => column.name === "agent_id")
    ) {
      database.exec(
        "ALTER TABLE tickets ADD COLUMN agent_id INTEGER REFERENCES agents(id);",
      );
    }
    const insertAgent = database.prepare(`
      INSERT INTO agents (first_name, last_name, email, password_hash)
      VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING
    `);
    for (const agent of agents) {
      if (
        !database.prepare("SELECT id FROM agents WHERE email = ?").get(agent[2])
      ) {
        insertAgent.run(...agent);
      }
    }
    if (
      database.prepare("SELECT count(*) AS count FROM employees").get()
        .count === 0
    ) {
      const insertEmployee = database.prepare(`
        INSERT INTO employees
          (first_name, last_name, employee_number, email, search_key)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const employee of employees) {
        insertEmployee.run(...employee);
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

module.exports = { initializeDatabase };
