const { database } = require("../database");
const ticketQuery = `
  SELECT tickets.id, title, description, priority, status,
    reporter_id AS reporterId, created_at AS createdAt,
    employees.first_name || ' ' || employees.last_name AS reporterName,
    employee_number AS employeeNumber, employees.email AS reporterEmail,
    agent_id AS agentId,
    agents.first_name || ' ' || agents.last_name AS agentName
  FROM tickets JOIN employees ON employees.id = tickets.reporter_id
  LEFT JOIN agents ON agents.id = tickets.agent_id
`;

function listTickets() {
  return database.prepare(`${ticketQuery} ORDER BY tickets.id DESC`).all();
}

function findTicketById(id) {
  return database.prepare(`${ticketQuery} WHERE tickets.id = ?`).get(id);
}

function findTicketByContent(title, description) {
  return database
    .prepare("SELECT id FROM tickets WHERE title = ? AND description = ?")
    .get(title, description);
}

function createTicket(ticket) {
  const result = database
    .prepare(
      `
    INSERT INTO tickets
      (title, description, priority, status, reporter_id, agent_id, created_at)
    VALUES (?, ?, ?, 'new', ?, ?, ?)
  `,
    )
    .run(
      ticket.title,
      ticket.description,
      ticket.priority,
      ticket.reporterId,
      ticket.agentId,
      ticket.createdAt,
    );
  return Number(result.lastInsertRowid);
}

function changeTicketStatus(id, status) {
  return database
    .prepare("UPDATE tickets SET status = ? WHERE id = ?")
    .run(status, id).changes;
}

function deleteClosedTicket(id) {
  return database
    .prepare("DELETE FROM tickets WHERE id = ? AND status = 'closed'")
    .run(id).changes;
}

module.exports = {
  listTickets,
  findTicketById,
  findTicketByContent,
  createTicket,
  changeTicketStatus,
  deleteClosedTicket,
};
