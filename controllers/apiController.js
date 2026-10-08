const people = require("../services/peopleService");
const tickets = require("../services/ticketService");
const {
  getCsrfToken,
  sessionCookieOptions,
} = require("../middleware/security");
const {
  getLabState,
  selectLabVariant,
  presentTicket,
} = require("../middleware/lab");

function getSession(request, response) {
  response.json({
    agent: request.session.agent || null,
    csrfToken: getCsrfToken(request),
    lab: getLabState(request),
  });
}

function changeLabMode(request, response, next) {
  const { variant } = request.body;
  selectLabVariant(request, variant);
  request.session.save((error) => {
    if (error) return next(error);
    response.json({ variant });
  });
}

function login(request, response, next) {
  const agent = people.authenticateAgent(
    request.body.email,
    request.body.password,
  );
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
}

function logout(request, response, next) {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("medidesk.sid", sessionCookieOptions);
    response.json({ message: "Wylogowano." });
  });
}

function searchEmployees(request, response) {
  response.json(people.searchEmployees(request.query.search ?? ""));
}

function listAgents(request, response) {
  response.json(people.listAgents());
}

function listTickets(request, response) {
  response.json(tickets.listTickets());
}

function getTicket(request, response) {
  response.json(
    presentTicket(request, tickets.getTicket(Number(request.params.id))),
  );
}

function createTicket(request, response) {
  response.status(201).json(tickets.createTicket(request.body));
}

function changeTicketStatus(request, response) {
  const ticket = tickets.changeTicketStatus(
    Number(request.params.id),
    request.body.status,
  );
  response.json(presentTicket(request, ticket));
}

function deleteTicket(request, response) {
  tickets.deleteTicket(Number(request.params.id));
  response.json({ message: "Usunięto zamknięte zgłoszenie." });
}

module.exports = {
  getSession,
  changeLabMode,
  login,
  logout,
  searchEmployees,
  listAgents,
  listTickets,
  getTicket,
  createTicket,
  changeTicketStatus,
  deleteTicket,
};
