// This module contains all functions that directly manipulate the DOM.

// ---------------------------------------------------------------------------
// XSS Prevention: HTML entity escaper
//
// Any user-supplied string (transaction description, category name, etc.)
// MUST pass through this function before being injected into innerHTML.
// This converts <, >, &, ", ' into their safe HTML entity equivalents,
// so the browser renders them as text rather than executing them as markup.
//
// Example: sanitize('<script>alert(1)</script>') → '&lt;script&gt;alert(1)&lt;/script&gt;'
// ---------------------------------------------------------------------------
const sanitize = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

// Renders the list of transactions.(takes the div where transactions have to be shown, returns transactions array)
export const renderTransactionsList = (container, transactions) => {
  container.innerHTML = "";
  if (transactions.length === 0) {
    container.innerHTML =
      '<p class="text-gray-600 dark:text-gray-400 text-center py-8">No transactions found.</p>';
    return;
  }
  const listContainer = document.createElement("div");
  listContainer.className = "space-y-3";
  transactions.forEach((t) => {
    const date = new Date(t.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const isExpense = t.type === "expense";
    const amountColor = isExpense ? "text-red-500" : "text-green-500";
    const sign = isExpense ? "-" : "+";
    const categoryName = sanitize(t.category.name);

    const el = document.createElement("div");
    el.className =
      "bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm flex items-center justify-between transition-transform transform hover:scale-[1.02]";

    // Safe static HTML — no user data interpolated here
    el.innerHTML = `
            <div class="flex items-center gap-4 flex-grow">
                <div class="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${isExpense ? "bg-red-100 dark:bg-red-900/50" : "bg-green-100 dark:bg-green-900/50"}">
                    <span class="text-xl">${categoryName === "Salary" ? "💰" : isExpense ? "🛍️" : "📈"}</span>
                </div>
                <div>
                    <p class="font-semibold text-gray-800 dark:text-gray-200" data-description></p>
                    <p class="text-sm text-gray-500 dark:text-gray-400"><span data-category></span> ・ ${date}</p>
                </div>
            </div>
            <div class="flex items-center gap-4">
                <p class="font-semibold text-lg ${amountColor}">${sign} ₹${t.amount.toLocaleString()}</p>
                <button data-id="${sanitize(t._id)}" class="delete-btn p-2 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;

    // Use textContent for user-supplied strings — never interpolated into HTML
    // textContent sets the literal text, making XSS structurally impossible
    el.querySelector("[data-description]").textContent = t.description;
    el.querySelector("[data-category]").textContent = t.category.name;

    listContainer.appendChild(el);
  });
  container.appendChild(listContainer);
};

// Updates the pagination controls UI.
export const updatePaginationUI = (elements, paginationState) => {
  const { currentPage, totalPages } = paginationState;
  if (totalPages > 0) {
    elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    elements.prevPageBtn.disabled = currentPage <= 1;
    elements.nextPageBtn.disabled = currentPage >= totalPages;
    elements.paginationControls.classList.remove("hidden");
  } else {
    elements.paginationControls.classList.add("hidden");
  }
};

// Creates a custom dropdown button for filters.(from the parameters given to it)
export const createDropdown = (name, options, defaultLabel, onSelect) => {
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "relative inline-block text-left";
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "inline-flex items-center justify-center w-full rounded-md border border-gray-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none";
  button.innerHTML = `<span id="${sanitize(name)}-label">${sanitize(defaultLabel)}</span><svg class="-mr-1 ml-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
  const menu = document.createElement("div");
  menu.className =
    "origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none hidden z-10";

  options.forEach((option) => {
    const a = document.createElement("a");
    a.href = "#";
    a.className =
      "text-gray-700 dark:text-gray-300 block px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700";
    a.dataset.value = option.value;
    // Use textContent — option labels can contain user category names
    a.textContent = option.label;
    a.onclick = (e) => {
      e.preventDefault();
      document.getElementById(`${name}-label`).textContent = option.label;
      menu.classList.add("hidden");
      onSelect(option.value); // Fire the callback
    };
    menu.appendChild(a);
  });

  dropdownContainer.append(button, menu);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    document
      .querySelectorAll(
        ".relative .origin-top-left, #profile-menu, #theme-menu",
      )
      .forEach((m) => m !== menu && m.classList.add("hidden"));
    menu.classList.toggle("hidden");
  });
  return dropdownContainer;
};

// Renders the user's profile button in the header.
export const renderProfileButton = (container, user) => {
  // user.image comes from the Mongoose User model (set during Google OAuth)
  // user.photos is a Passport profile property not stored in our DB
  const userPicture =
    user.image ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random&color=fff`;

  container.innerHTML = `
        <div class="relative">
            <button id="profile-menu-button" type="button" class="flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-slate-800 focus:ring-blue-500">
                <img class="h-8 w-8 rounded-full object-cover" src="${sanitize(userPicture)}" alt="User profile">
            </button>
            <div id="profile-menu" class="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black dark:ring-white ring-opacity-5 py-1 z-20">
                <a href="/analytics" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">Analytics</a>
                <a href="/auth/logout" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">Logout</a>
            </div>
        </div>
    `;
  const profileMenuButton = document.getElementById("profile-menu-button");
  const profileMenu = document.getElementById("profile-menu");
  if (profileMenuButton && profileMenu) {
    profileMenuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.getElementById("theme-menu"))
        document.getElementById("theme-menu").classList.add("hidden");
      profileMenu.classList.toggle("hidden");
    });
  }
};

// Reusable Toast Notification Function
export const showToast = (message, type = "success") => {
  const toast = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");
  const toastIcon = document.getElementById("toast-icon");
  if (!toast || !toastMessage || !toastIcon) return;

  // Reset styles from previous toasts
  toast.classList.remove("bg-green-500", "bg-red-500");

  // Define styles and icons for each type
  const styles = {
    success: {
      bg: "bg-green-500",
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`,
    },
    error: {
      bg: "bg-red-500",
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    },
  };

  // Apply the correct style based on the 'type' argument
  const style = styles[type] || styles.success;
  toast.classList.add(style.bg);
  toastIcon.innerHTML = style.icon; // Safe — this is our own static SVG, not user data
  toastMessage.textContent = message; // textContent — never innerHTML for messages
  toast.classList.remove("hidden");

  // Hide it after 5 seconds
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 5000);
};
