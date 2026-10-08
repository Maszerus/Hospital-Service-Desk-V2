function apiNotFound(request, response) {
  response.status(404).json({ message: "Nie znaleziono endpointu." });
}

function pageNotFound(request, response) {
  response.status(404).send("Nie znaleziono strony.");
}

function handleError(error, request, response, next) {
  if (response.headersSent) return next(error);
  const status = error.isPublic
    ? error.status
    : error.status === 413
      ? 413
      : error.status === 400
        ? 400
        : 500;
  if (status === 500) console.error("Błąd serwera:", error.message);
  response.status(status).json({
    message: error.isPublic
      ? error.message
      : status === 500
        ? "Błąd serwera."
        : "Niepoprawny lub zbyt duży JSON.",
  });
}

module.exports = { apiNotFound, pageNotFound, handleError };
