const { GoogleGenerativeAI } = require("@google/generative-ai");

const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 10_000_000;
const MAX_STRING_LENGTH = 200;

const validateReceiptData = (raw) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, reason: "Response is not an object." };
  }
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, reason: `Invalid amount: ${raw.amount}` };
  }
  if (amount > MAX_AMOUNT) {
    return { valid: false, reason: `Amount exceeds maximum: ${amount}` };
  }
  if (typeof raw.date !== "string" || !DATE_REGEX.test(raw.date)) {
    return { valid: false, reason: `Invalid date format: ${raw.date}` };
  }
  const year = parseInt(raw.date.slice(0, 4), 10);
  if (year < 2000 || year > new Date().getFullYear() + 1) {
    return { valid: false, reason: `Date year out of range: ${year}` };
  }
  if (typeof raw.category !== "string" || raw.category.trim().length === 0) {
    return { valid: false, reason: "Category is missing or empty." };
  }
  if (raw.category.length > MAX_STRING_LENGTH) {
    return { valid: false, reason: "Category name too long." };
  }
  return {
    valid: true,
    data: {
      amount,
      date: raw.date,
      category: raw.category.trim().slice(0, 100),
    },
  };
};

const validateTransactionItem = (raw, index) => {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, reason: "Item is not an object.", index };
  }
  if (!VALID_TRANSACTION_TYPES.has(raw.type)) {
    return { valid: false, reason: `Invalid type "${raw.type}" at item ${index}`, index };
  }
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { valid: false, reason: `Invalid amount "${raw.amount}" at item ${index}`, index };
  }
  if (typeof raw.description !== "string" || raw.description.trim().length === 0) {
    return { valid: false, reason: `Missing description at item ${index}`, index };
  }
  if (typeof raw.category !== "string" || raw.category.trim().length === 0) {
    return { valid: false, reason: `Missing category at item ${index}`, index };
  }
  if (typeof raw.date !== "string" || !DATE_REGEX.test(raw.date)) {
    return { valid: false, reason: `Invalid date "${raw.date}" at item ${index}`, index };
  }
  return {
    valid: true,
    data: {
      type: raw.type,
      amount,
      description: raw.description.trim().slice(0, MAX_STRING_LENGTH),
      category: raw.category.trim().slice(0, 100),
      date: raw.date,
    },
  };
};

exports.extractTextFromImage = async (imageBuffer, mimeType) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt =
    'You are a receipt data extractor. Extract ONLY the total amount, date, and category from the receipt image. ' +
    'Respond with ONLY a JSON object in this exact format, no other text: ' +
    '{ "amount": <number>, "date": "<YYYY-MM-DD>", "category": "<single word category>" }. ' +
    'Category must be one of: Food, Transport, Groceries, Utility, Entertainment, Other.';

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
  ]);

  const text = result.response.text();
  const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error("Gemini returned non-JSON for receipt:", text.slice(0, 200));
    throw new Error("Could not interpret the receipt's content.");
  }

  const validation = validateReceiptData(parsed);
  if (!validation.valid) {
    console.error("Gemini receipt output failed validation:", validation.reason, "| Raw:", JSON.stringify(parsed));
    throw new Error("Receipt data could not be verified. Please try a clearer image.");
  }

  return validation.data;
};

exports.extractTransactionsFromPdf = async (pdfBuffer, mimeType) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt =
    "You are a bank statement parser. Extract ALL transaction rows from this PDF. " +
    "For each transaction, return a JSON object with exactly these keys: " +
    '"description" (string, the item/merchant name), ' +
    '"category" (string, one of: Food/Transport/Groceries/Utility/Entertainment/Other), ' +
    '"date" (string, format YYYY-MM-DD), ' +
    '"amount" (positive number), ' +
    '"type" (string, exactly "income" for credits or "expense" for debits). ' +
    "Return ONLY a JSON array of these objects. No explanation, no markdown, no headers. " +
    "If you cannot determine a field, use reasonable defaults.";

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: pdfBuffer.toString("base64"), mimeType } },
  ]);

  const responseText = result.response.text();
  const jsonText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

  let rawTransactions;
  try {
    rawTransactions = JSON.parse(jsonText);
  } catch (e) {
    console.error("Gemini PDF returned non-JSON:", responseText.slice(0, 300));
    throw new Error("The AI could not parse this PDF. Please ensure it is a valid bank statement.");
  }

  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    throw new Error("Gemini could not extract any transactions from this PDF.");
  }

  const validTransactions = [];
  const skipped = [];

  rawTransactions.slice(0, 200).forEach((item, index) => {
    const validation = validateTransactionItem(item, index);
    if (validation.valid) {
      validTransactions.push(validation.data);
    } else {
      skipped.push(validation.reason);
    }
  });

  if (validTransactions.length === 0) {
    throw new Error("Could not extract any valid transactions. Please check the PDF format.");
  }

  if (skipped.length > 0) {
    console.warn(`[PDF Import] Skipped ${skipped.length} invalid items:`, skipped.slice(0, 5));
  }

  return validTransactions;
};

exports.generateFinancialAdvice = async (summaryData) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt =
    "You are an expert financial advisor. I will provide you with a user's current spending selection and their month-over-month history. " +
    "Analyze the data and provide exactly 3 bullet points of highly specific, actionable financial advice. " +
    "Rule 1: Point out exactly where they spent more or less compared to previous months using specific numbers and category names. " +
    "Rule 2: Provide actionable suggestions for investing their savings (e.g., specific ideas like index funds, emergency fund, paying off debt) rather than generic theory. " +
    "Rule 3: Keep it encouraging but purely data-driven. " +
    "Respond with ONLY a JSON object in this exact format: " +
    '{ "advice": ["point 1", "point 2", "point 3"] }. ' +
    "Data: " + JSON.stringify(summaryData);

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error("Gemini advice returned non-JSON:", text.slice(0, 200));
    throw new Error("Could not generate advice at this time.");
  }

  if (!parsed.advice || !Array.isArray(parsed.advice) || parsed.advice.length === 0) {
    throw new Error("Invalid advice format received from AI.");
  }

  return parsed.advice.slice(0, 3);
};
