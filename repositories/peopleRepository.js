const { database } = require("../database");

function findAgentByEmail(email) {
  return database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName, email,
      password_hash AS passwordHash FROM agents WHERE email = ?
  `,
    )
    .get(email);
}

function listAgents() {
  return database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName, email
    FROM agents ORDER BY id
  `,
    )
    .all();
}

function findAgentById(id) {
  return database.prepare("SELECT id FROM agents WHERE id = ?").get(id);
}

function findEmployeeById(id) {
  return database.prepare("SELECT id FROM employees WHERE id = ?").get(id);
}

function findFirstEmployee() {
  return database.prepare("SELECT id FROM employees ORDER BY id LIMIT 1").get();
}

function searchEmployees(search) {
  return database
    .prepare(
      `
    SELECT id, first_name AS firstName, last_name AS lastName,
      employee_number AS employeeNumber
    FROM employees WHERE instr(search_key, ?) > 0 ORDER BY id
  `,
    )
    .all(search);
}

function updateAgentPasswords(agents) {
  database.exec("BEGIN;");
  try {
    const update = database.prepare(
      "UPDATE agents SET password_hash = ? WHERE id = ?",
    );
    for (const agent of agents) update.run(agent.passwordHash, agent.id);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

module.exports = {
  findAgentByEmail,
  listAgents,
  findAgentById,
  findEmployeeById,
  findFirstEmployee,
  searchEmployees,
  updateAgentPasswords,
};
