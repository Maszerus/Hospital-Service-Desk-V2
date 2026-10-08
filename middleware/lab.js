const { labEnabled } = require("../config/server");
const {
  initializeLabTicket,
  validateLabVariant,
  xssDescription,
  xssHash,
} = require("../services/demoService");
let labTicketId = null;

function initializeLab() {
  if (labEnabled) labTicketId = initializeLabTicket();
}

function isLabBefore(request) {
  return labEnabled && request.session?.labVariant === "BEFORE";
}

function presentTicket(request, ticket) {
  return {
    ...ticket,
    descriptionRendering:
      isLabBefore(request) &&
      ticket.id === labTicketId &&
      ticket.description === xssDescription
        ? "html"
        : "text",
  };
}

function getLabState(request) {
  return {
    enabled: labEnabled,
    variant: isLabBefore(request) ? "BEFORE" : "AFTER",
    ticketId: labTicketId,
  };
}

function selectLabVariant(request, variant) {
  validateLabVariant(labEnabled, variant);
  request.session.labVariant = variant;
}

function setSecurityHeaders(request, response, next) {
  const controlledHandler =
    isLabBefore(request) && request.path === "/ticket-details.html"
      ? ` 'unsafe-hashes' 'sha256-${xssHash}'`
      : "";
  response.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self'${controlledHandler}`,
      "style-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  response.set("Cache-Control", "no-store");
  next();
}

module.exports = {
  initializeLab,
  isLabBefore,
  presentTicket,
  getLabState,
  selectLabVariant,
  setSecurityHeaders,
};
