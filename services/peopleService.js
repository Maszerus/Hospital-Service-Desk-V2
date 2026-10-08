const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const peopleRepository = require("../repositories/peopleRepository");
const { reject } = require("./validation");

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, hash] = passwordHash.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeSearch(value) {
  return value
    .trim()
    .toLocaleLowerCase("pl")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function authenticateAgent(email, password) {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof password !== "string" ||
    !password.trim() ||
    password.length > 200
  ) {
    reject(400, "Podaj e-mail i hasło demonstracyjne.");
  }
  const account = peopleRepository.findAgentByEmail(email.trim().toLowerCase());
  if (!account || !verifyPassword(password, account.passwordHash)) {
    reject(401, "Niepoprawny e-mail lub hasło.");
  }
  const { passwordHash, ...agent } = account;
  return agent;
}

function listAgents() {
  return peopleRepository.listAgents();
}

function searchEmployees(search) {
  if (typeof search !== "string" || search.length > 100) {
    reject(400, "Wyszukiwanie może mieć do 100 znaków.");
  }
  return peopleRepository.searchEmployees(normalizeSearch(search));
}

function setAgentPasswords(password) {
  const agents = peopleRepository.listAgents().map((agent) => ({
    id: agent.id,
    passwordHash: createPasswordHash(password),
  }));
  peopleRepository.updateAgentPasswords(agents);
}

module.exports = {
  authenticateAgent,
  listAgents,
  searchEmployees,
  setAgentPasswords,
  createPasswordHash,
  normalizeSearch,
};
