async function setupCsrfTest() {
  const form = document.querySelector("#csrf-form");
  const message = document.querySelector("#test-message");
  try {
    const response = await fetch("/config");
    const { targetOrigin } = await response.json();
    const ticketId = document.querySelector("#ticket-id");
    function updateTarget() {
      form.action = `${targetOrigin}/api/tickets/${ticketId.value}/status`;
    }
    ticketId.addEventListener("input", updateTarget);
    const tokenMode = document.querySelector("#token-mode");
    const testToken = document.querySelector("#test-token");
    tokenMode.addEventListener("change", () => {
      testToken.disabled = tokenMode.value !== "invalid";
    });
    updateTarget();
    form.querySelector("button").disabled = false;
    message.textContent = `Cel testu: ${targetOrigin}. Wybierz brak lub błędny token.`;
  } catch {
    message.textContent = "Nie można przygotować lokalnego testu CSRF.";
  }
}
setupCsrfTest();
