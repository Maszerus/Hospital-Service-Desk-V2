const statusLabels = {
  new: "Nowe",
  progress: "W trakcie",
  closed: "Zamknięte",
};
const priorityLabels = { low: "Niski", medium: "Średni", high: "Wysoki" };
let csrfToken = "";
const ticketUpdates = new BroadcastChannel("medidesk-tickets");

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
    filter.onchange = renderRows;
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

async function loadTicketDetails(container) {
  const response = await fetch("partials/ticket-details.html");
  if (!response.ok) throw new Error("Nie można wczytać widoku szczegółów.");
  // To wspólny statyczny szablon aplikacji, bez danych użytkownika.
  container.innerHTML = await response.text();
}

function renderTicketDetails(
  ticket,
  container = document,
  allowLabHtml = false,
) {
  const values = {
    "ticket-number": `Zgłoszenie MD-${String(ticket.id).padStart(3, "0")}`,
    "ticket-title": ticket.title,
    "ticket-description": ticket.description,
    "ticket-priority": priorityLabels[ticket.priority],
    "ticket-reporter": ticket.reporterName,
    "ticket-agent": ticket.agentName || "Nieprzypisane",
    "ticket-email": ticket.reporterEmail,
    "ticket-date": new Date(ticket.createdAt).toLocaleString("pl-PL"),
  };
  for (const [id, value] of Object.entries(values))
    container.querySelector(`#${id}`).textContent = value;
  if (allowLabHtml && ticket.descriptionRendering === "html") {
    // Serwer dopuszcza HTML wyłącznie dla jednego stałego wpisu laboratoryjnego.
    container.querySelector("#ticket-description").innerHTML =
      ticket.description;
  }
  const status = container.querySelector("#ticket-status");
  status.textContent = statusLabels[ticket.status];
  status.className = `badge status-${ticket.status}`;
  const statusSelect = container.querySelector("#status");
  if (statusSelect) statusSelect.value = ticket.status;
  const deleteButton = container.querySelector("#delete-ticket-button");
  if (deleteButton) deleteButton.hidden = ticket.status !== "closed";
  if (container === document) document.title = `${ticket.title} | MediDesk`;
}

async function initializePage() {
  const pageMessage =
    document.querySelector("#page-message") ||
    document.querySelector("[data-form-message]");
  try {
    const session = await requestApi("/api/session");
    csrfToken = session.csrfToken;
    const labControls = document.querySelector("#lab-controls");
    if (labControls && session.lab.enabled) {
      labControls.hidden = false;
      for (const button of labControls.querySelectorAll("[data-lab-variant]")) {
        button.disabled = !session.agent;
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.labVariant === session.lab.variant),
        );
        button.addEventListener("click", async () => {
          for (const control of labControls.querySelectorAll("button"))
            control.disabled = true;
          try {
            await requestApi("/api/lab/mode", "POST", {
              variant: button.dataset.labVariant,
            });
            location.reload();
          } catch (error) {
            showMessage(pageMessage, error.message, true);
            for (const control of labControls.querySelectorAll("button"))
              control.disabled = false;
          }
        });
      }
      const demoLink = document.querySelector("#lab-xss-link");
      demoLink.href = `ticket-details.html?id=${session.lab.ticketId}`;
    }
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
    if (!session.agent) {
      location.href = "login.html";
      return;
    }
    document.querySelector(".account p").textContent =
      `${session.agent.firstName} ${session.agent.lastName}`;
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
    if (document.querySelector("#ticket-rows")) {
      renderTickets(await requestApi("/api/tickets"));
      async function refreshTickets() {
        try {
          renderTickets(await requestApi("/api/tickets"));
        } catch (error) {
          showMessage(pageMessage, error.message, true);
        }
      }
      ticketUpdates.addEventListener("message", refreshTickets);
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) refreshTickets();
      });
    }
    const ticketForm = document.querySelector("#ticket-form");
    if (ticketForm) {
      const detailsDialog = document.querySelector("#created-ticket-dialog");
      const detailsContent = document.querySelector("#created-ticket-content");
      await loadTicketDetails(detailsContent);
      detailsDialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const controls = detailsDialog.querySelectorAll("button, a[href]");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      detailsDialog.addEventListener("close", () => {
        ticketForm.querySelector('[type="submit"]').focus();
      });
      const agents = await requestApi("/api/agents");
      const agentSelect = document.querySelector("#agent");
      for (const agent of agents) {
        agentSelect.add(
          new Option(`${agent.firstName} ${agent.lastName}`, String(agent.id)),
        );
      }
      const searchEmployees = await setupEmployeeSearch();
      setupForm(ticketForm, async (fields) => {
        const data = Object.fromEntries(fields);
        data.reporterId = Number(data.reporterId);
        data.agentId = data.agentId ? Number(data.agentId) : null;
        const ticket = await requestApi("/api/tickets", "POST", data);
        renderTicketDetails(ticket, detailsContent);
        document.querySelector("#created-ticket-link").href =
          `ticket-details.html?id=${ticket.id}`;
        detailsDialog.showModal();
        ticketUpdates.postMessage("tickets-changed");
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
      await loadTicketDetails(
        document.querySelector("#ticket-details-content"),
      );
      const id = new URLSearchParams(location.search).get("id") || "1";
      const ticket = await requestApi(`/api/tickets/${encodeURIComponent(id)}`);
      renderTicketDetails(ticket, document, true);
      const deleteButton = document.querySelector("#delete-ticket-button");
      deleteButton.addEventListener("click", async () => {
        if (
          !window.confirm(
            "Czy na pewno usunąć zamknięte zgłoszenie? Tej operacji nie można cofnąć.",
          )
        )
          return;
        deleteButton.disabled = true;
        try {
          await requestApi(`/api/tickets/${ticket.id}`, "DELETE", {});
          ticketUpdates.postMessage("tickets-changed");
          location.href = "tickets.html";
        } catch (error) {
          showMessage(pageMessage, error.message, true);
          deleteButton.disabled = false;
        }
      });
      setupForm(statusForm, async (fields) => {
        const updated = await requestApi(
          `/api/tickets/${ticket.id}/status`,
          "PATCH",
          { status: fields.get("status") },
        );
        renderTicketDetails(updated, document, true);
        ticketUpdates.postMessage("tickets-changed");
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
