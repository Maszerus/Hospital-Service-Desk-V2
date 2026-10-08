function normalizeSearch(value) {
  return value
    .trim()
    .toLocaleLowerCase("pl")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function setupTicketFilter() {
  const statusFilter = document.querySelector("#status-filter");

  if (!statusFilter) {
    return;
  }

  const ticketRows = document.querySelectorAll("[data-status]");
  const filterMessage = document.querySelector("#filter-message");

  function filterTickets() {
    let visibleCount = 0;

    for (const row of ticketRows) {
      const matchesStatus =
        statusFilter.value === "all" ||
        row.dataset.status === statusFilter.value;

      row.hidden = !matchesStatus;

      if (matchesStatus) {
        visibleCount += 1;
      }
    }

    filterMessage.textContent = `Liczba widocznych zgłoszeń: ${visibleCount}.`;
  }

  statusFilter.disabled = false;
  statusFilter.addEventListener("change", filterTickets);
  filterTickets();
}

function setupEmployeeSearch() {
  const employeeSearch = document.querySelector("#employee-search");

  if (!employeeSearch) {
    return;
  }

  const reporterSelect = document.querySelector("#reporter");
  const searchMessage = document.querySelector("#search-message");
  const employeeOptions = Array.from(reporterSelect.options).slice(1);
  const emptyOption = reporterSelect.options[0];

  function searchEmployees() {
    const query = normalizeSearch(employeeSearch.value);
    const selectedValue = reporterSelect.value;
    const matches = employeeOptions.filter((option) =>
      normalizeSearch(option.textContent).includes(query),
    );

    reporterSelect.replaceChildren(
      emptyOption.cloneNode(true),
      ...matches.map((option) => option.cloneNode(true)),
    );

    if (matches.some((option) => option.value === selectedValue)) {
      reporterSelect.value = selectedValue;
    }

    reporterSelect.dispatchEvent(new Event("change", { bubbles: true }));
    searchMessage.textContent = matches.length
      ? `Liczba znalezionych pracowników: ${matches.length}. Wybierz zgłaszającego z listy.`
      : "Nie znaleziono pracownika. Zmień lub wyczyść wyszukiwanie.";
  }

  employeeSearch.disabled = false;
  employeeSearch.addEventListener("input", searchEmployees);
}

function setupDemoForms() {
  const forms = document.querySelectorAll("[data-demo-form]");

  for (const form of forms) {
    const formMessage = form.querySelector("[data-form-message]");
    const requiredFields = form.querySelectorAll("[required]");
    const submitButton = form.querySelector('[type="submit"]');

    for (const field of requiredFields) {
      field.setAttribute("aria-describedby", formMessage.id);
    }

    function clearFeedback(event) {
      formMessage.textContent = "";
      formMessage.classList.remove("message-error", "message-success");
      event.target.removeAttribute("aria-invalid");
      if (typeof event.target.setCustomValidity === "function") {
        event.target.setCustomValidity("");
      }
    }

    function submitDemoForm(event) {
      event.preventDefault();
      let firstInvalidField = null;

      for (const field of requiredFields) {
        const label = form.querySelector(`label[for="${field.id}"]`);
        let errorMessage = "";

        field.setCustomValidity("");

        if (!field.value.trim()) {
          errorMessage = `Uzupełnij wymagane pole: ${label.textContent}.`;
        } else if (field.validity.typeMismatch) {
          errorMessage = "Podaj poprawny adres e-mail.";
        } else if (!field.validity.valid) {
          errorMessage = `Sprawdź wartość pola: ${label.textContent}.`;
        }

        field.setCustomValidity(errorMessage);
        if (errorMessage) {
          field.setAttribute("aria-invalid", "true");
          if (!firstInvalidField) {
            firstInvalidField = field;
          }
        } else {
          field.removeAttribute("aria-invalid");
        }
      }

      formMessage.classList.remove("message-error", "message-success");

      if (firstInvalidField) {
        formMessage.textContent = firstInvalidField.validationMessage;
        formMessage.classList.add("message-error");
        firstInvalidField.focus();
        return;
      }

      formMessage.textContent = form.dataset.successMessage;
      formMessage.classList.add("message-success");
    }

    form.addEventListener("submit", submitDemoForm);
    form.addEventListener("input", clearFeedback);
    form.addEventListener("change", clearFeedback);
    form.noValidate = true;
    submitButton.disabled = false;
  }
}

setupDemoForms();
setupTicketFilter();
setupEmployeeSearch();
