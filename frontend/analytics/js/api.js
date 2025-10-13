// This module handles all communication with the backend analytics API.
const BASE_URL = '';

// Fetches the currently authenticated user's data.
export const fetchUserData = async () => {
    const response = await fetch(`${BASE_URL}/auth/me`, { credentials: 'include' });
    if (!response.ok) throw new Error('User not authenticated');
    return await response.json();
};

// Fetches the financial summary data for a given time frame(parameter)
export const fetchSummary = async (timeFrame) => {
    const response = await fetch(`${BASE_URL}/api/analytics/summary?dateRange=${timeFrame}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch summary data');
    return await response.json();
};

// Fetches the expenses grouped by category for a given time frame.
export const fetchExpensesByCategory = async (timeFrame) => {
    const response = await fetch(`${BASE_URL}/api/analytics/expenses-by-category?dateRange=${timeFrame}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch category expenses');
    return await response.json();
};

// Fetches the monthly income vs. expense summary.
export const fetchMonthlySummary = async () => {
    const response = await fetch(`${BASE_URL}/api/analytics/monthly-summary`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch monthly summary');
    return await response.json();
};

// Fetches all unique category names for the user.
export const fetchCategories = async () => {
    const response = await fetch(`${BASE_URL}/api/transactions/categories`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch categories');
    return await response.json();
};

// Fetches the spending trend for a specific category. Takes "category" as parameter and returns array of the data
export const fetchCategoryTrend = async (categoryName) => {
    const response = await fetch(`${BASE_URL}/api/analytics/category-trend?categoryName=${encodeURIComponent(categoryName)}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch category trend');
    return await response.json();
};