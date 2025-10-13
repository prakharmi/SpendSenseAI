// This module handles all communication with the backend API.
const BASE_URL = "";

// Fetches the currently authenticated user's data.
export const fetchUserData = async () => {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("User not authenticated");
  return await response.json();
};

// Fetches transactions from the server based on current filters and pagination.
export const fetchTransactions = async (state) => {
  const { type, category, dateRange } = state.filters;
  const { currentPage, itemsPerPage } = state.pagination;
  const url = `${BASE_URL}/api/transactions?page=${currentPage}&limit=${itemsPerPage}&type=${type}&category=${category}&dateRange=${dateRange}`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch transactions");
  return await response.json();
};

// Fetches the unique category names for the user.
export const fetchCategories = async () => {
  const response = await fetch(`${BASE_URL}/api/transactions/categories`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch categories");
  return await response.json();
};

// Submits a new transaction to the server.
export const addTransaction = async (transactionData) => {
  const response = await fetch(`${BASE_URL}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transactionData),
    credentials: "include",
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to add transaction");
  }
  return await response.json();
};

// Deletes a transaction from the server.
export const deleteTransaction = async (transactionId) => {
  const response = await fetch(
    `${BASE_URL}/api/transactions/${transactionId}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to delete transaction");
  }
  return await response.json();
};

// Function to add multiple transactions from PDF import
export const addMultipleTransactions = async (transactions) => {
  const response = await fetch(`${BASE_URL}/api/transactions/add-multiple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions }), // The backend expects an object with a 'transactions' key
    credentials: "include",
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to add transactions");
  }
  return await response.json();
};
