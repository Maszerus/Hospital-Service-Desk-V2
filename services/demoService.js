const { randomBytes, createHash } = require("node:crypto");
const schema = require("../repositories/databaseRepository");
const tickets = require("../repositories/ticketRepository");
const people = require("../repositories/peopleRepository");
const { createPasswordHash, normalizeSearch } = require("./peopleService");
const { reject } = require("./validation");

function initializeDatabase(reset = false) {
  const agents = [
    ["Przemysław", "Rozmanowski", "p.rozmanowski@jakotako.com"],
    ["Jaromir", "Malina", "j.malina@jakotako.com"],
    ["Daniel", "Pejs", "d.pejs@jakotako.com"],
    ["Adrian", "Szymczyk", "a.szymczyk@jakotako.com"],
  ];
  const employees = [
    ["Alicja", "Przykładowa", "DEMO-001", "demo01@example.invalid"],
    ["Bartosz", "Testowy", "DEMO-002", "demo02@example.invalid"],
    ["Celina", "Fikcyjna", "DEMO-003", "demo03@example.invalid"],
  ];
  schema.initializeDatabase(
    reset,
    agents.map((agent) => [
      ...agent,
      createPasswordHash(randomBytes(18).toString("hex")),
    ]),
    employees.map((employee) => [
      ...employee,
      normalizeSearch(employee.slice(0, 3).join(" ")),
    ]),
  );
}
const xssHandler = "alert('LAB XSS: nieszkodliwy komunikat demonstracyjny.')";
const xssDescription =
  '<img src="/lab/xss-demo-missing-image" ' +
  `alt="Demonstracja XSS" onerror="${xssHandler}">`;
const xssHash = createHash("sha256").update(xssHandler).digest("base64");

function initializeLabTicket() {
  const title = "LAB: kontrolowany przykład XSS";
  const existing = tickets.findTicketByContent(title, xssDescription);
  if (existing) return existing.id;
  return tickets.createTicket({
    title,
    description: xssDescription,
    priority: "low",
    reporterId: people.findFirstEmployee().id,
    agentId: null,
    createdAt: new Date().toISOString(),
  });
}

function validateLabVariant(enabled, variant) {
  if (!enabled) reject(403, "Laboratorium jest wyłączone.");
  if (!["BEFORE", "AFTER"].includes(variant)) {
    reject(400, "Wybierz BEFORE lub AFTER.");
  }
}

module.exports = {
  initializeDatabase,
  initializeLabTicket,
  validateLabVariant,
  xssDescription,
  xssHash,
};
