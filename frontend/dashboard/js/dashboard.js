// This is the main controller script for the dashboard.
// It manages the application state and connects UI events to API calls.
import * as api from "./api.js";
import * as ui from "./ui.js";
import * as db from "./db.js";

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
    exportPassbookBtn: document.getElementById("export-passbook-btn"),
    // Note: receiptUploadInput and pdfUploadInput are NOT here
    // because they are rendered dynamically by setupPwaNetworkListeners
    receiptModal: document.getElementById("receipt-confirmation-modal"),
    receiptForm: document.getElementById("receipt-confirmation-form"),
    cancelReceiptBtn: document.getElementById("cancel-receipt-import"),
    pdfModal: document.getElementById("pdf-confirmation-modal"),
    pdfForm: document.getElementById("pdf-confirmation-form"),
    pdfListDiv: document.getElementById("pdf-transactions-list"),
    cancelPdfBtn: document.getElementById("cancel-pdf-import"),
    aiUploadSection: document.getElementById("ai-upload-section"),
    offlineDot: document.getElementById("offline-dot"),
  };

  // Clears all cached transaction pages from localStorage.
  // Must be called after any write (add/delete) so the next load fetches fresh data.
  const clearTransactionCache = () => {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dashboard_transactions_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  };

  // M1 Fix: Promise-based custom delete confirmation modal.
  // Returns a Promise that resolves true (confirm) or false (cancel).
  // Keeps the async/await delete flow clean without window.confirm() blocking the thread.
  const confirmDelete = () => new Promise((resolve) => {
    const modal = document.getElementById("delete-confirm-modal");
    const okBtn = document.getElementById("delete-confirm-ok");
    const cancelBtn = document.getElementById("delete-confirm-cancel");
    const backdrop = document.getElementById("delete-confirm-backdrop");
    if (!modal || !okBtn || !cancelBtn) { resolve(false); return; }

    const cleanup = () => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop.removeEventListener("click", onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    backdrop.addEventListener("click", onCancel);
    modal.classList.remove("hidden");
    // Focus the cancel button by default (safer UX — requires deliberate click to delete)
    cancelBtn.focus();
  });

  const loadPageContent = async () => {
    try {
      const cacheKey = `dashboard_transactions_${JSON.stringify(state.filters)}_${state.pagination.currentPage}_${state.pagination.itemsPerPage}`;
      
      // Fetch offline transactions from IndexedDB
      const offlineTxs = await db.getOfflineTransactions();
      
      // Paint cached data immediately (0ms)
      const cached = localStorage.getItem(cacheKey);
      let displayTransactions = [];
      let currentPage = state.pagination.currentPage;
      let totalPages = 1;
      
      if (cached) {
        const parsed = JSON.parse(cached);
        displayTransactions = parsed.transactions;
        currentPage = parsed.currentPage;
        totalPages = parsed.totalPages;
      } else if (elements.transactionListDiv.innerHTML === "") {
        elements.transactionListDiv.innerHTML =
          '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>';
      }

      // Prepend offline transactions if on page 1
      let combinedCached = [...displayTransactions];
      if (currentPage === 1 && offlineTxs.length > 0) {
        combinedCached = [...offlineTxs.reverse(), ...displayTransactions];
      }
      
      if (cached || offlineTxs.length > 0) {
        ui.renderTransactionsList(elements.transactionListDiv, combinedCached);
        if (cached) ui.updatePaginationUI(elements, { ...state.pagination, currentPage, totalPages });
      }

      // If offline, stop here so we don't throw an API error. The user sees cached + offline txs.
      if (!navigator.onLine) {
        return;
      }

      // Fetch fresh data
      const data = await api.fetchTransactions(state);
      
      // Store in cache
      localStorage.setItem(cacheKey, JSON.stringify(data));
      
      // Update UI silently
      let finalTransactions = data.transactions;
      if (data.currentPage === 1 && offlineTxs.length > 0) {
        finalTransactions = [...offlineTxs.reverse(), ...data.transactions];
      }

      ui.renderTransactionsList(elements.transactionListDiv, finalTransactions);
      state.pagination.currentPage = data.currentPage;
      state.pagination.totalPages = data.totalPages;
      ui.updatePaginationUI(elements, state.pagination);
    } catch (error) {
      console.error("Error loading page content:", error);
      elements.transactionListDiv.innerHTML =
        '<p class="text-red-500 text-center py-4">Could not load transactions. Please check your connection.</p>';
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
      const cacheKey = 'dashboard_categories';
      const cached = localStorage.getItem(cacheKey);
      let categories = [];
      
      if (cached) {
        categories = JSON.parse(cached);
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
      }

      categories = await api.fetchCategories();
      localStorage.setItem(cacheKey, JSON.stringify(categories));
      
      // Only append if we didn't use cache, otherwise the dropdown is already rendered
      if (!cached) {
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
      }
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

      // Build the row structure with static HTML only — no user data here
      transactionRow.innerHTML = `
                <div class="col-span-2"><input type="date" data-field="date" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5"></div>
                <div class="col-span-5"><input type="text" data-field="description" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Description"></div>
                <div class="col-span-2"><input type="text" data-field="category" class="pdf-input w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Category"></div>
                <div class="col-span-2"><input type="number" data-field="amount" step="0.01" class="pdf-input w-full text-right rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm text-sm p-1.5" placeholder="Amount"></div>
                <div class="col-span-1 flex justify-center"><button type="button" class="remove-pdf-item-btn p-1.5 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div>
            `;

      // Set user-supplied values via DOM .value property — NOT innerHTML interpolation.
      // This is the correct pattern: DOM APIs treat the value as plain text,
      // making attribute injection (e.g., " onmouseover=alert(1)) structurally impossible.
      transactionRow.querySelector('[data-field="date"]').value = t.date || "";
      transactionRow.querySelector('[data-field="description"]').value = t.description || "";
      transactionRow.querySelector('[data-field="category"]').value = t.category || "";
      transactionRow.querySelector('[data-field="amount"]').value =
        typeof t.amount === "number" ? t.amount.toFixed(2) : "";

      const typeInput = document.createElement("input");
      typeInput.type = "hidden";
      typeInput.dataset.field = "type";
      typeInput.value = t.type; // Safe — this is set via .value, not innerHTML
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
      if (!navigator.onLine) {
        // Save to IndexedDB for offline sync
        try {
          // Generate a temporary ID so it renders correctly in the list (will be replaced when synced)
          const offlineTx = { ...transactionData, _id: "offline_" + Date.now(), isOffline: true };
          await db.addOfflineTransaction(offlineTx);
          
          elements.transactionForm.reset();
          if (elements.dateInput) elements.dateInput.valueAsDate = new Date();
          
          ui.showToast("Saved offline. Will sync when reconnected.", "info");
          
          // DO NOT clear cache here, because we need the cached past transactions to render!
          // We just reload the page content to inject the new offline tx into the existing cached list.
          state.pagination.currentPage = 1;
          await loadPageContent();
        } catch (error) {
          ui.showToast("Error saving offline.", "error");
        }
        return;
      }

      try {
        await api.addTransaction(transactionData);
        elements.transactionForm.reset();
        if (elements.dateInput) elements.dateInput.valueAsDate = new Date();
        ui.showToast("Transaction added successfully!", "success");
        clearTransactionCache(); // Invalidate stale pages before re-fetching
        state.pagination.currentPage = 1;
        await loadPageContent();
      } catch (error) {
        ui.showToast(error.message, "error");
      }
    });
  };

  // Sets up listeners for the receipt and PDF file upload buttons.
  // Called once on init AND again every time we go back online (because the
  // DOM is rebuilt by renderOnlineUploadUI and needs fresh event listeners).
  const setupFileUploadListeners = () => {
    const receiptInput = document.getElementById("receipt-upload");
    const pdfInput = document.getElementById("pdf-upload");

    if (receiptInput) {
      receiptInput.addEventListener("change", async (event) => {
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

    if (pdfInput) {
      pdfInput.addEventListener("change", async (event) => {
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
          clearTransactionCache(); // Invalidate stale pages before re-fetching
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
          
          // Handle offline delete attempts
          if (!navigator.onLine) {
            if (transactionId.startsWith('offline_')) {
              const confirmed = await confirmDelete();
              if (confirmed) {
                try {
                  await db.deleteOfflineTransaction(transactionId);
                  ui.showToast("Pending transaction deleted.", "success");
                  await loadPageContent();
                } catch (error) {
                  ui.showToast("Error deleting offline transaction.", "error");
                }
              }
            } else {
              ui.showToast("Cannot delete synced transactions while offline.", "warning");
            }
            return;
          }

          // M1 Fix: use custom modal instead of blocking window.confirm()
          const confirmed = await confirmDelete();
          if (confirmed) {
            try {
              await api.deleteTransaction(transactionId);
              ui.showToast("Transaction deleted!", "success");
              clearTransactionCache(); // Invalidate stale pages before re-fetching
              await loadPageContent();
            } catch (error) {
              ui.showToast(error.message, "error");
            }
          }
        }
      });
    }
  };

  // Helper to dynamically load external scripts
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // Sets up the PDF export logic
  const setupExportPassbookListener = () => {
    if (!elements.exportPassbookBtn) return;
    
    elements.exportPassbookBtn.addEventListener("click", async () => {
      try {
        ui.showToast("Generating Passbook...", "info");
        
        // Dynamically load PDF libraries if not already loaded
        if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.prototype.autoTable) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
          // jsPDF-autotable expects 'jsPDF' to be on the window object
          window.jsPDF = window.jspdf.jsPDF;
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
        }
        // We use a loop to fetch past 3 months of data securely at 100 items per page
        let allTransactions = [];
        let currentPage = 1;
        let totalPages = 1;
        
        do {
          const response = await fetch(`/api/transactions?page=${currentPage}&limit=100&type=all&category=all&dateRange=3months`, { credentials: "include" });
          if (!response.ok) throw new Error("Failed to fetch data for export");
          
          const data = await response.json();
          if (data.transactions && data.transactions.length > 0) {
            allTransactions = allTransactions.concat(data.transactions);
          }
          totalPages = data.totalPages || 1;
          currentPage++;
        } while (currentPage <= totalPages);
        
        const transactions = allTransactions;
        
        if (!transactions || transactions.length === 0) {
          ui.showToast("No transactions to export.", "warning");
          return;
        }

        // The API returns newest first. Reverse to get chronological order (oldest first)
        transactions.reverse();
        
        const doc = new window.jspdf.jsPDF();
        
        doc.setFontSize(18);
        doc.text("SpendSenseAI Passbook", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        
        let currentBalance = 0;
        const tableData = transactions.map(tx => {
          const isIncome = tx.type === 'income';
          currentBalance += isIncome ? tx.amount : -tx.amount;
          
          return [
            new Date(tx.date).toLocaleDateString(),
            tx.description || '-',
            tx.category || '-',
            !isIncome ? `Rs. ${tx.amount.toFixed(2)}` : '-',
            isIncome ? `Rs. ${tx.amount.toFixed(2)}` : '-',
            `Rs. ${currentBalance.toFixed(2)}`
          ];
        });
        
        doc.autoTable({
          startY: 40,
          head: [['Date', 'Description', 'Category', 'Debit (-)', 'Credit (+)', 'Balance']],
          body: tableData,
          theme: 'striped',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [15, 23, 42] }, // slate-900
          columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' }
          }
        });
        
        doc.save("SpendSense_Passbook.pdf");
        ui.showToast("Passbook downloaded successfully!", "success");
      } catch (error) {
        console.error("Export error:", error);
        ui.showToast(`Error: ${error.message || "Failed to generate passbook"}`, "error");
      }
    });
  };

  // ---------------------------------------------------------------------------
  // PWA Offline / Online Network Listeners
  //
  // UX philosophy: Don't grey out buttons when offline — replace them entirely.
  // A clear state change is more honest and less confusing than disabled UI.
  // • Online  → render the two upload cards + bind file events
  // • Offline → render a clean banner explaining why AI features are unavailable
  //              + show a pulsing amber dot in the header
  // ---------------------------------------------------------------------------
  const renderOnlineUploadUI = () => {
    if (!elements.aiUploadSection) return;
    elements.aiUploadSection.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-4">
        <label
          for="receipt-upload"
          class="flex-1 bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-slate-700
                 text-gray-500 dark:text-gray-400 font-semibold py-3 px-4 rounded-lg cursor-pointer
                 flex items-center justify-center gap-2 hover:border-blue-400 dark:hover:border-blue-500
                 transition-colors group"
        >
          <svg class="h-5 w-5 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span class="group-hover:text-blue-500 transition-colors">Scan Receipt with AI</span>
        </label>
        <input type="file" id="receipt-upload" class="hidden" accept="image/*" />

        <label
          for="pdf-upload"
          class="flex-1 bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-slate-700
                 text-gray-500 dark:text-gray-400 font-semibold py-3 px-4 rounded-lg cursor-pointer
                 flex items-center justify-center gap-2 hover:border-emerald-400 dark:hover:border-emerald-500
                 transition-colors group"
        >
          <svg class="h-5 w-5 group-hover:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <span class="group-hover:text-emerald-500 transition-colors">Import Bank Statement PDF</span>
        </label>
        <input type="file" id="pdf-upload" class="hidden" accept=".pdf" />
      </div>
    `;
    // Bind events to the freshly created DOM elements
    setupFileUploadListeners();
  };

  const renderOfflineUploadUI = () => {
    if (!elements.aiUploadSection) return;
    elements.aiUploadSection.innerHTML = `
      <div class="animate-slide-down flex items-center gap-4 bg-amber-50 dark:bg-amber-900/20
                  border border-amber-200 dark:border-amber-700/50 rounded-lg px-5 py-4">
        <!-- WiFi-off icon -->
        <div class="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40
                    flex items-center justify-center">
          <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072
                 M12 11a1 1 0 100 2 1 1 0 000-2z"
            />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18"/>
          </svg>
        </div>
        <div>
          <p class="font-semibold text-amber-800 dark:text-amber-300 text-sm">AI features unavailable offline</p>
          <p class="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
            Receipt scanning and PDF import need an internet connection.
            You can still add transactions manually above.
          </p>
        </div>
      </div>
    `;
  };

  // Setup offline/online network listener for PWA
  const setupPwaNetworkListeners = () => {
    const applyNetworkState = (isOnline) => {
      // Header dot
      if (elements.offlineDot) {
        elements.offlineDot.classList.toggle("hidden", isOnline);
        elements.offlineDot.classList.toggle("flex", !isOnline);
      }
      // Swap upload section
      if (isOnline) {
        renderOnlineUploadUI();
      } else {
        renderOfflineUploadUI();
      }
    };

    const syncOfflineData = async () => {
      try {
        const offlineTxs = await db.getOfflineTransactions();
        if (offlineTxs.length === 0) return;

        ui.showToast(`Syncing ${offlineTxs.length} offline transactions...`, "info");
        
        let successCount = 0;
        for (const tx of offlineTxs) {
          try {
            // Remove the temporary properties used for local tracking
            const { _id, isOffline, _offlineAddedAt, ...apiTxData } = tx;
            await api.addTransaction(apiTxData);
            await db.deleteOfflineTransaction(tx.id); // Remove from IndexedDB on success
            successCount++;
          } catch (err) {
            console.error("Failed to sync transaction:", tx, err);
          }
        }

        if (successCount > 0) {
          ui.showToast(`Successfully synced ${successCount} transactions!`, "success");
          clearTransactionCache();
          await loadPageContent();
        }
      } catch (error) {
        console.error("Error during offline sync:", error);
      }
    };

    window.addEventListener("online", () => {
      applyNetworkState(true);
      ui.showToast("Back online!", "success");
      syncOfflineData();
    });
    window.addEventListener("offline", () => {
      applyNetworkState(false);
    });

    // Apply immediately on page load
    applyNetworkState(navigator.onLine);
    if (navigator.onLine) {
      syncOfflineData();
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
      // Note: setupFileUploadListeners() is called by renderOnlineUploadUI()
      // inside setupPwaNetworkListeners() — don't call it here to avoid double-binding
      setupModalListeners();
      setupListAndPaginationListeners();
      setupExportPassbookListener();
      setupPwaNetworkListeners();

      await populateFilters();
      await loadPageContent();
    } catch (error) {
      window.location.href = "/";
    }
  };

  init(); // Start the application
});
