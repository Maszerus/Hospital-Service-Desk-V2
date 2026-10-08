const statusLabels = {
  new: "Nowe",
  progress: "W trakcie",
  closed: "Zamknięte",
};
const priorityLabels = { low: "Niski", medium: "Średni", high: "Wysoki" };
let csrfToken = "";

async function requestApi(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers:
      method === "GET"
        ? {}
        : {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error("Nie można połączyć się z serwerem. Odśwież stronę.");
  });
  const data = await response.json().catch(() => {
    throw new Error("Niepoprawna odpowiedź serwera.");
  });
  if (!response.ok) {
    if (response.status === 401 && !location.pathname.endsWith("login.html")) {
      location.href = "login.html";
    }
    throw new Error(data.message || "Nie udało się wykonać operacji.");
  }
  return data;
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("message-error", isError);
  element.classList.toggle("message-success", !isError && Boolean(message));
}

function validateForm(form) {
  let firstInvalidField = null;
  for (const field of form.querySelectorAll("[required]")) {
    const label = form.querySelector(`label[for="${field.id}"]`);
    field.setCustomValidity("");
    if (!field.value.trim()) {
      field.setCustomValidity(`Uzupełnij wymagane pole: ${label.textContent}.`);
    } else if (field.validity.typeMismatch) {
      field.setCustomValidity("Podaj poprawny adres e-mail.");
    } else if (!field.validity.valid) {
      field.setCustomValidity(`Sprawdź wartość pola: ${label.textContent}.`);
    }
    if (!field.validity.valid) {
      field.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field.removeAttribute("aria-invalid");
    }
  }
  if (firstInvalidField) {
    showMessage(
      form.querySelector("[data-form-message]"),
      firstInvalidField.validationMessage,
      true,
    );
    firstInvalidField.focus();
    return false;
  }
  return true;
}

function setupForm(form, submitForm) {
  const message = form.querySelector("[data-form-message]");
  const button = form.querySelector('[type="submit"]');
  form.noValidate = true;
  for (const field of form.querySelectorAll("[required]")) {
    field.setAttribute("aria-describedby", message.id);
  }
  function clearFeedback(event) {
    showMessage(message, "");
    event.target.removeAttribute("aria-invalid");
    if (typeof event.target.setCustomValidity === "function") {
      event.target.setCustomValidity("");
    }
  }
  form.addEventListener("input", clearFeedback);
  form.addEventListener("change", clearFeedback);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateForm(form)) return;
    button.disabled = true;
    try {
      await submitForm(new FormData(form));
    } catch (error) {
      showMessage(message, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  button.disabled = false;
}

function addCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderTickets(tickets) {
  const tableBody = document.querySelector("#ticket-rows");
  const filter = document.querySelector("#status-filter");
  const dashboard = location.pathname.endsWith("dashboard.html");
  function renderRows() {
    const filtered =
      filter && filter.value !== "all"
        ? tickets.filter((ticket) => ticket.status === filter.value)
        : tickets;
    const visible = dashboard ? filtered.slice(0, 5) : filtered;
    tableBody.replaceChildren();
    for (const ticket of visible) {
      const row = document.createElement("tr");
      const link = document.createElement("a");
      link.href = `ticket-details.html?id=${ticket.id}`;
      link.textContent = `MD-${String(ticket.id).padStart(3, "0")} · ${ticket.title}`;
      addCell(row, "").append(link);
      addCell(row, ticket.reporterName);
      const badge = document.createElement("span");
      badge.className = `badge status-${ticket.status}`;
      badge.textContent = statusLabels[ticket.status];
      addCell(row, "").append(badge);
      const priorityCell = addCell(row, priorityLabels[ticket.priority]);
      if (ticket.priority === "high") priorityCell.className = "priority-high";
      addCell(row, new Date(ticket.createdAt).toLocaleDateString("pl-PL"));
      tableBody.append(row);
    }
    const message =
      document.querySelector("#filter-message") ||
      document.querySelector("#page-message");
    message.textContent = visible.length
      ? `Liczba widocznych zgłoszeń: ${visible.length}.`
      : "Brak zgłoszeń dla wybranego statusu.";
  }
  if (filter) {
    filter.disabled = false;
    filter.addEventListener("change", renderRows);
  }
  for (const card of document.querySelectorAll("[data-stat]")) {
    card.textContent =
      card.dataset.stat === "all"
        ? tickets.length
        : tickets.filter((ticket) => ticket.status === card.dataset.stat)
            .length;
  }
  renderRows();
}

async function setupEmployeeSearch() {
  const input = document.querySelector("#employee-search");
  const select = document.querySelector("#reporter");
  const message = document.querySelector("#search-message");
  let searchNumber = 0;
  async function searchEmployees() {
    const currentSearch = ++searchNumber;
    const selectedValue = select.value;
    try {
      const employees = await requestApi(
        `/api/employees?search=${encodeURIComponent(input.value)}`,
      );
      if (currentSearch !== searchNumber) return;
      select.replaceChildren(new Option("Wybierz zgłaszającego", ""));
      for (const employee of employees) {
        select.add(
          new Option(
            `${employee.firstName} ${employee.lastName} · ${employee.employeeNumber}`,
            String(employee.id),
          ),
        );
      }
      if (employees.some((employee) => String(employee.id) === selectedValue))
        select.value = selectedValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      showMessage(
        message,
        employees.length
          ? `Znaleziono pracowników: ${employees.length}.`
          : "Nie znaleziono pracownika. Zmień lub wyczyść wyszukiwanie.",
      );
    } catch (error) {
      if (currentSearch !== searchNumber) return;
      select.replaceChildren(new Option("Wybierz zgłaszającego", ""));
      showMessage(message, error.message, true);
    }
  }
  await searchEmployees();
  input.disabled = false;
  input.addEventListener("input", searchEmployees);
  return searchEmployees;
}

function renderTicketDetails(ticket) {
  const values = {
    "ticket-number": `Zgłoszenie MD-${String(ticket.id).padStart(3, "0")}`,
    "ticket-title": ticket.title,
    "ticket-description": ticket.description,
    "ticket-priority": priorityLabels[ticket.priority],
    "ticket-reporter": ticket.reporterName,
    "ticket-email": ticket.reporterEmail,
    "ticket-date": new Date(ticket.createdAt).toLocaleString("pl-PL"),
  };
  for (const [id, value] of Object.entries(values))
    document.getElementById(id).textContent = value;
  const status = document.querySelector("#ticket-status");
  status.textContent = statusLabels[ticket.status];
  status.className = `badge status-${ticket.status}`;
  document.querySelector("#status").value = ticket.status;
  document.title = `${ticket.title} | MediDesk`;
}

async function initializePage() {
  const pageMessage =
    document.querySelector("#page-message") ||
    document.querySelector("[data-form-message]");
  try {
    const session = await requestApi("/api/session");
    csrfToken = session.csrfToken;
    const loginForm = document.querySelector("#login-form");
    if (loginForm) {
      setupForm(loginForm, async (fields) => {
        const result = await requestApi(
          "/api/login",
          "POST",
          Object.fromEntries(fields),
        );
        csrfToken = result.csrfToken;
        location.href = "dashboard.html";
      });
      return;
    }
    if (!session.employee) {
      location.href = "login.html";
      return;
    }
    document.querySelector(".account p").textContent =
      `${session.employee.firstName} ${session.employee.lastName}`;
    const logoutButton = document.querySelector("#logout-button");
    logoutButton.disabled = false;
    logoutButton.addEventListener("click", async () => {
      try {
        await requestApi("/api/logout", "POST", {});
        location.href = "login.html";
      } catch (error) {
        showMessage(pageMessage, error.message, true);
      }
    });
    if (document.querySelector("#ticket-rows"))
      renderTickets(await requestApi("/api/tickets"));
    const ticketForm = document.querySelector("#ticket-form");
    if (ticketForm) {
      const searchEmployees = await setupEmployeeSearch();
      setupForm(ticketForm, async (fields) => {
        const data = Object.fromEntries(fields);
        data.reporterId = Number(data.reporterId);
        const ticket = await requestApi("/api/tickets", "POST", data);
        ticketForm.reset();
        await searchEmployees();
        showMessage(
          ticketForm.querySelector("[data-form-message]"),
          `Zapisano zgłoszenie MD-${String(ticket.id).padStart(3, "0")}. Znajdziesz je na liście zgłoszeń.`,
        );
      });
    }
    const statusForm = document.querySelector("#status-form");
    if (statusForm) {
      const id = new URLSearchParams(location.search).get("id") || "1";
      const ticket = await requestApi(`/api/tickets/${encodeURIComponent(id)}`);
      renderTicketDetails(ticket);
      setupForm(statusForm, async (fields) => {
        const updated = await requestApi(
          `/api/tickets/${ticket.id}/status`,
          "PATCH",
          { status: fields.get("status") },
        );
        renderTicketDetails(updated);
        showMessage(
          statusForm.querySelector("[data-form-message]"),
          "Zapisano nowy status zgłoszenia.",
        );
      });
    }
  } catch (error) {
    showMessage(
      pageMessage,
      error.message || "Nie można połączyć się z serwerem.",
      true,
    );
  }
}
initializePage();
