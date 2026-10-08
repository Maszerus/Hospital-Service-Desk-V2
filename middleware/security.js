const session = require("express-session");
const { randomBytes } = require("node:crypto");
const { labEnabled, port, origin, tlsOptions } = require("../config/server");
const { isLabBefore } = require("./lab");

function requireLocalHost(request, response, next) {
  if (request.get("host") !== `127.0.0.1:${port}`) {
    return response.status(403).json({ message: "Użyj adresu 127.0.0.1." });
  }
  response.set("X-Content-Type-Options", "nosniff");
  next();
}
const sessionMiddleware = session({
  name: "medidesk.sid",
  secret: randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: Boolean(tlsOptions),
    maxAge: 3600000,
  },
});

function getCsrfToken(request) {
  if (!request.session.csrfToken) {
    request.session.csrfToken = randomBytes(32).toString("hex");
  }
  return request.session.csrfToken;
}

function protectApi(request, response, next) {
  response.set("Cache-Control", "no-store");
  if (["GET", "HEAD"].includes(request.method)) {
    return next();
  }
  const isStatusChange =
    ["POST", "PATCH"].includes(request.method) &&
    /^\/tickets\/\d+\/status$/.test(request.path);
  const bypassCsrf = isStatusChange && isLabBefore(request);
  const isLabStatusForm =
    labEnabled &&
    isStatusChange &&
    request.is("application/x-www-form-urlencoded");
  const token =
    request.get("X-CSRF-Token") ||
    (isLabStatusForm ? request.body?.csrfToken : undefined);
  if (!bypassCsrf && (!token || token !== request.session.csrfToken)) {
    return response
      .status(403)
      .json({ message: "Niepoprawny token CSRF. Odśwież stronę." });
  }
  if (
    !bypassCsrf &&
    request.get("origin") &&
    request.get("origin") !== origin
  ) {
    return response
      .status(403)
      .json({ message: "Niedozwolone źródło żądania." });
  }
  if (!request.is("application/json") && !isLabStatusForm) {
    return response.status(415).json({ message: "Wymagany jest format JSON." });
  }
  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    return response
      .status(400)
      .json({ message: "Niepoprawne dane formularza." });
  }
  next();
}

function requireSession(request, response, next) {
  if (!request.session.agent) {
    return response
      .status(401)
      .json({ message: "Zaloguj się do demonstracji." });
  }
  next();
}

module.exports = {
  requireLocalHost,
  sessionMiddleware,
  getCsrfToken,
  protectApi,
  requireSession,
};
