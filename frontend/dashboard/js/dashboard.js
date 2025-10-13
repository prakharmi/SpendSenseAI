// This is the main controller script for the dashboard.
// It manages the application state and connects UI events to API calls.
import * as api from "./api.js";
import * as ui from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  // Current State Management
  const state = {
    filters: { type: "all", category: "all", dateRange: "all" },
    pagination: { currentPage: 1, totalPages: 1, itemsPerPage: 10 },
  };

  // Element Selectors
  const elements = {
    welcomeMessage: document.querySelector("#welcome-message h1"),
    themeMenuButton: document.getElementById("theme-menu-button"),
    themeMenu: document.getElementById("theme-menu"),
    profileButtonContainer: document.getElementById("profile-button-container"),
    transactionForm: document.getElementById("transaction-form"),
    dateInput: document.getElementById("date"),
    transactionListDiv: document.getElementById("transaction-list"),
    filterControls: document.getElementById("filter-controls"),
    paginationControls: document.getElementById("pagination-controls"),
    limitSelect: document.getElementById("limit-select"),
    pageInfo: document.getElementById("page-info"),
    prevPageBtn: document.getElementById("prev-page-btn"),
    nextPageBtn: document.getElementById("next-page-btn"),
    receiptUploadInput: document.getElementById("receipt-upload"),
    receiptModal: document.getElementById("receipt-confirmation-modal"),
    receiptForm: document.getElementById("receipt-confirmation-form"),
    cancelReceiptBtn: document.getElementById("cancel-receipt-import"),
    pdfUploadInput: document.getElementById("pdf-upload"),
    pdfModal: document.getElementById("pdf-confirmation-modal"),
    pdfForm: document.getElementById("pdf-confirmation-form"),
    pdfListDiv: document.getElementById("pdf-transactions-list"),
    cancelPdfBtn: document.getElementById("cancel-pdf-import"),
  };

  // Fetches transactions based on the current state and renders them to the page
  const loadPageContent = async () => {
    try {
      elements.transactionListDiv.innerHTML =
        '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>';
      const data = await api.fetchTransactions(state);
      ui.renderTransactionsList(elements.transactionListDiv, data.transactions);
      state.pagination.currentPage = data.currentPage;
      state.pagination.totalPages = data.totalPages;
      ui.updatePaginationUI(elements, state.pagination);
    } catch (error) {
      console.error("Error loading page content:", error);
      elements.transactionListDiv.innerHTML =
        '<p class="text-red-500 text-center py-4">Could not load transactions.</p>';
    }
  };

  // Fetches categories and populates the filter dropdowns.
  const populateFilters = async () => {
    elements.filterControls.innerHTML = "";
    const onFilterSelect = (filterName, value) => {
      state.filters[filterName] = value;
      state.pagination.currentPage = 1;
      loadPageContent();
    };

    const typeOptions = [
      { value: "all", label: "All Types" },
      { value: "income", label: "Income" },
      { value: "expense", label: "Expense" },
    ];
    elements.filterControls.appendChild(
      ui.createDropdown("type", typeOptions, "All Types", (value) =>
        onFilterSelect("type", value),
      ),
    );

    const dateOptions = [
      { value: "all", label: "All Time" },
      { value: "week", label: "Past Week" },
      { value: "month", label: "Past Month" },
      { value: "3months", label: "Past 3 Months" },
    ];
    elements.filterControls.appendChild(
      ui.createDropdown("dateRange", dateOptions, "All Time", (value) =>
        onFilterSelect("dateRange", value),
      ),
    );

    try {
      const categories = await api.fetchCategories();
      const categoryOptions = [
        { value: "all", label: "All Categories" },
        ...categories.map((cat) => ({ value: cat, label: cat })),
      ];
      elements.filterControls.appendChild(
        ui.createDropdown(
          "category",
          categoryOptions,
          "All Categories",
          (value) => onFilterSelect("category", value),
        ),
      );
    } catch (error) {
      console.error("Could not load categories:", error);
    }
  };

  // Displays the confirmation modal for a single receipt transaction.
  const showReceiptConfirmationModal = (data) => {
    elements.receiptForm.querySelector("#receipt-description").value =
      data.description;
    elements.receiptForm.querySelector("#receipt-amount").value = data.amount;
    elements.receiptForm.querySelector("#receipt-date").value = data.date;
    elements.receiptForm.querySelector("#receipt-category").value =
      data.category;
    elements.receiptModal.classList.remove("hidden");
  };

  // Hides the receipt confirmation modal.
  const hideReceiptConfirmationModal = () => {
    elements.receiptModal.classList.add("hidden");
    elements.receiptForm.reset();
  };

  // Displays the confirmation modal for a list of PDF transactions.
  const showPdfConfirmationModal = (transactions) => {
    elements.pdfListDiv.innerHTML = "";
    transactions.forEach((t) => {
      const transactionRow = document.createElement("div");
      transactionRow.className =
        "grid grid-cols-12 gap-4 items-center p-2 rounded-md odd:bg-slate-50 dark:odd:bg-slate-700/50";
      transactionRow.innerHTML = `
                <div class="col-span-2"><input type="date" value="${t.date}" data-field="date" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5"></div>
                <div class="col-span-5"><input type="text" value="${t.description}" data-field="description" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Description"></div>
                <div class="col-span-2"><input type="text" value="${t.category}" data-field="category" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Category"></div>
                <div class="col-span-2"><input type="number" value="${t.amount.toFixed(2)}" data-field="amount" step="0.01" class="pdf-input w-full text-right rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Amount"></div>
                <div class="col-span-1 flex justify-center"><button type="button" class="remove-pdf-item-btn p-1.5 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div>
            `;
      const typeInput = document.createElement("input");
      typeInput.type = "hidden";
      typeInput.dataset.field = "type";
      typeInput.value = t.type;
      transactionRow.appendChild(typeInput);
      elements.pdfListDiv.appendChild(transactionRow);
    });
    elements.pdfModal.classList.remove("hidden");
  };

  // Hides the PDF confirmation modal.
  const hidePdfConfirmationModal = () => {
    elements.pdfModal.classList.add("hidden");
    elements.pdfListDiv.innerHTML = "";
  };

  // Sets up listeners for theme switching and global clicks to close menus.
  const setupHeaderListeners = () => {
    if (!elements.themeMenuButton) return;
    const applyTheme = (theme) =>
      document.documentElement.classList.toggle("dark", theme === "dark");
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) applyTheme(savedTheme);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
      applyTheme("dark");

    elements.themeMenuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const profileMenu = document.getElementById("profile-menu");
      if (profileMenu) profileMenu.classList.add("hidden");
      elements.themeMenu.classList.toggle("hidden");
    });

    elements.themeMenu.querySelectorAll("[data-theme]").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.preventDefault();
        const selectedTheme = e.target.getAttribute("data-theme");
        if (selectedTheme === "system") {
          localStorage.removeItem("theme");
          applyTheme(
            window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light",
          );
        } else {
          localStorage.setItem("theme", selectedTheme);
          applyTheme(selectedTheme);
        }
        elements.themeMenu.classList.add("hidden");
      });
    });

    window.addEventListener("click", () => {
      const profileMenu = document.getElementById("profile-menu");
      if (
        elements.themeMenu &&
        !elements.themeMenu.classList.contains("hidden")
      )
        elements.themeMenu.classList.add("hidden");
      if (profileMenu && !profileMenu.classList.contains("hidden"))
        profileMenu.classList.add("hidden");
      document
        .querySelectorAll(".relative .origin-top-left")
        .forEach((m) => m.classList.add("hidden"));
    });
  };

  // Sets up the listener for the main manual transaction form.
  const setupTransactionFormListener = () => {
    if (!elements.transactionForm) return;
    let transactionType = "expense";
    const typeButtons = elements.transactionForm.querySelectorAll(
      ".transaction-type-btn",
    );

    typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        transactionType = button.getAttribute("data-type");
        typeButtons.forEach((btn) =>
          btn.classList.remove(
            "bg-white",
            "dark:bg-slate-600",
            "shadow-sm",
            "text-gray-900",
            "dark:text-white",
          ),
        );
        button.classList.add(
          "bg-white",
          "dark:bg-slate-600",
          "shadow-sm",
          "text-gray-900",
          "dark:text-white",
        );
      });
    });

    if (elements.dateInput) elements.dateInput.valueAsDate = new Date();

    elements.transactionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(elements.transactionForm);
      const transactionData = {
        type: transactionType,
        description: formData.get("description"),
        amount: formData.get("amount"),
        category: formData.get("category"),
        date: formData.get("date"),
      };
      try {
        await api.addTransaction(transactionData);
        elements.transactionForm.reset();
        if (elements.dateInput) elements.dateInput.valueAsDate = new Date();
        ui.showToast("Transaction added successfully!", "success");
        state.pagination.currentPage = 1;
        await loadPageContent();
      } catch (error) {
        ui.showToast(error.message, "error");
      }
    });
  };

  // Sets up listeners for the receipt and PDF file upload buttons.
  const setupFileUploadListeners = () => {
    if (elements.receiptUploadInput) {
      elements.receiptUploadInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("receipt", file);
        ui.showToast("Processing receipt...", "success");
        try {
          const response = await fetch("/api/transactions/upload-receipt", {
            method: "POST",
            body: formData,
            credentials: "include",
          });
          event.target.value = ""; // Reset file input
          if (response.ok) {
            const extractedData = await response.json();
            showReceiptConfirmationModal(extractedData);
          } else {
            const error = await response.json();
            ui.showToast(error.message, "error");
          }
        } catch (error) {
          ui.showToast("Error processing receipt.", "error");
          console.error("Error uploading receipt:", error);
        }
      });
    }
    if (elements.pdfUploadInput) {
      elements.pdfUploadInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("pdf", file);
        ui.showToast("Processing PDF...", "success");
        try {
          const response = await fetch("/api/transactions/import-pdf", {
            method: "POST",
            body: formData,
            credentials: "include",
          });
          event.target.value = ""; // Reset file input
          if (response.ok) {
            const transactions = await response.json();
            showPdfConfirmationModal(transactions);
          } else {
            const error = await response.json();
            ui.showToast(error.message, "error");
          }
        } catch (error) {
          ui.showToast("Error processing PDF.", "error");
          console.error("Error processing PDF:", error);
        }
      });
    }
  };

  // Sets up listeners for actions within the confirmation modals (submit, cancel, discard item).
  const setupModalListeners = () => {
    if (elements.receiptForm) {
      elements.receiptForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const transactionData = {
          type: "expense",
          description: elements.receiptForm.querySelector(
            "#receipt-description",
          ).value,
          amount: elements.receiptForm.querySelector("#receipt-amount").value,
          date: elements.receiptForm.querySelector("#receipt-date").value,
          category:
            elements.receiptForm.querySelector("#receipt-category").value,
        };
        try {
          await api.addTransaction(transactionData);
          hideReceiptConfirmationModal();
          await loadPageContent();
          ui.showToast("Receipt transaction added!", "success");
        } catch (error) {
          ui.showToast(error.message, "error");
        }
      });
    }
    if (elements.cancelReceiptBtn)
      elements.cancelReceiptBtn.addEventListener(
        "click",
        hideReceiptConfirmationModal,
      );

    if (elements.pdfListDiv) {
      elements.pdfListDiv.addEventListener("click", (e) => {
        const removeButton = e.target.closest(".remove-pdf-item-btn");
        if (removeButton) removeButton.closest(".grid").remove();
      });
    }
    if (elements.pdfForm) {
      elements.pdfForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const transactionRows = elements.pdfListDiv.querySelectorAll(".grid");
        if (transactionRows.length === 0) {
          ui.showToast("Nothing to import.", "error");
          hidePdfConfirmationModal();
          return;
        }
        const transactionsToSave = [];
        transactionRows.forEach((row) => {
          transactionsToSave.push({
            date: row.querySelector('[data-field="date"]').value,
            description: row.querySelector('[data-field="description"]').value,
            amount: parseFloat(
              row.querySelector('[data-field="amount"]').value,
            ),
            type: row.querySelector('[data-field="type"]').value,
            category: row.querySelector('[data-field="category"]').value,
          });
        });

        try {
          await api.addMultipleTransactions(transactionsToSave);
          hidePdfConfirmationModal();
          await loadPageContent();
          ui.showToast(
            `${transactionsToSave.length} transactions added!`,
            "success",
          );
        } catch (error) {
          ui.showToast(error.message, "error");
        }
      });
    }
    if (elements.cancelPdfBtn)
      elements.cancelPdfBtn.addEventListener("click", hidePdfConfirmationModal);
  };

  // Sets up listeners for the transaction list (delete) and pagination controls.
  const setupListAndPaginationListeners = () => {
    if (elements.limitSelect) {
      elements.limitSelect.addEventListener("change", () => {
        state.pagination.itemsPerPage = parseInt(
          elements.limitSelect.value,
          10,
        );
        state.pagination.currentPage = 1;
        loadPageContent();
      });
    }
    if (elements.prevPageBtn) {
      elements.prevPageBtn.addEventListener("click", () => {
        if (state.pagination.currentPage > 1) {
          state.pagination.currentPage--;
          loadPageContent();
        }
      });
    }
    if (elements.nextPageBtn) {
      elements.nextPageBtn.addEventListener("click", () => {
        if (state.pagination.currentPage < state.pagination.totalPages) {
          state.pagination.currentPage++;
          loadPageContent();
        }
      });
    }
    if (elements.transactionListDiv) {
      elements.transactionListDiv.addEventListener("click", async (e) => {
        const deleteButton = e.target.closest(".delete-btn");
        if (deleteButton) {
          const transactionId = deleteButton.dataset.id;
          if (confirm("Are you sure you want to delete this transaction?")) {
            try {
              await api.deleteTransaction(transactionId);
              ui.showToast("Transaction deleted!", "success");
              await loadPageContent();
            } catch (error) {
              ui.showToast(error.message, "error");
            }
          }
        }
      });
    }
  };

  // The main initialization function for the page.
  const init = async () => {
    try {
      const user = await api.fetchUserData();
      elements.welcomeMessage.textContent = `Welcome back, ${user.displayName.split(" ")[0]}!`;
      ui.renderProfileButton(elements.profileButtonContainer, user);

      // Call all setup functions
      setupHeaderListeners();
      setupTransactionFormListener();
      setupFileUploadListeners();
      setupModalListeners();
      setupListAndPaginationListeners();

      await populateFilters();
      await loadPageContent();
    } catch (error) {
      window.location.href = "/";
    }
  };

  init(); // Start the application
});
