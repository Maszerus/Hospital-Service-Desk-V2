const tickets = require("../repositories/ticketRepository");
const people = require("../repositories/peopleRepository");
const { isValidId, reject } = require("./validation");

function listTickets() {
  return tickets.listTickets();
}

function getTicket(id) {
  if (!isValidId(id)) reject(400, "Niepoprawny numer zgłoszenia.");
  const ticket = tickets.findTicketById(id);
  if (!ticket) reject(404, "Nie znaleziono zgłoszenia.");
  return ticket;
}

function createTicket({
  title,
  description,
  priority,
  reporterId,
  agentId = null,
}) {
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
    reject(
      400,
      "Podaj tytuł (1–120 znaków), opis (1–5000 znaków), priorytet i zgłaszającego.",
    );
  }
  if (!people.findEmployeeById(reporterId)) {
    reject(400, "Wybierz istniejącego fikcyjnego pracownika.");
  }
  if (agentId !== null && !people.findAgentById(agentId)) {
    reject(400, "Wybierz istniejącego agenta Service Desku.");
  }
  const id = tickets.createTicket({
    title: title.trim(),
    description: description.trim(),
    priority,
    reporterId,
    agentId,
    createdAt: new Date().toISOString(),
  });
  return tickets.findTicketById(id);
}

function changeTicketStatus(id, status) {
  if (!isValidId(id) || !["new", "progress", "closed"].includes(status)) {
    reject(400, "Podaj poprawny numer i status zgłoszenia.");
  }
  if (!tickets.changeTicketStatus(id, status)) {
    reject(404, "Nie znaleziono zgłoszenia.");
  }
  return tickets.findTicketById(id);
}

function deleteTicket(id) {
  if (!isValidId(id)) reject(400, "Niepoprawny numer zgłoszenia.");
  const ticket = tickets.findTicketById(id);
  if (!ticket) reject(404, "Nie znaleziono zgłoszenia.");
  if (ticket.status !== "closed") {
    reject(409, "Można usunąć tylko zamknięte zgłoszenie.");
  }
  // Warunek w DELETE chroni też przed zmianą statusu między odczytem i zapisem.
  if (!tickets.deleteClosedTicket(id)) {
    const remaining = tickets.findTicketById(id);
    reject(
      remaining ? 409 : 404,
      remaining
        ? "Można usunąć tylko zamknięte zgłoszenie."
        : "Nie znaleziono zgłoszenia.",
    );
  }
}

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  changeTicketStatus,
  deleteTicket,
};
