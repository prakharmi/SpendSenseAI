const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/authMiddleware');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const multer = require('multer'); // for file upload of receipt
const { GoogleGenerativeAI } = require('@google/generative-ai'); // for using gemini API

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Function to extract text from an image using Gemini
async function extractTextFromImage(imageBuffer, mimeType) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in the environment variables.");
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const imageParts = [{
        inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType,
        },
    }, ];

    const result = await model.generateContent(['Extract the total amount, date, and a suitable category (e.g., Food, Shopping, Utilities) from this receipt. Return the result in clean JSON format ONLY, like this: { "amount": 123.45, "date": "YYYY-MM-DD", "category": "CategoryName" }', ...imageParts]);
    const response = await result.response;
    const text = response.text();
    
    try {
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON from Gemini:", text);
        throw new Error("Could not interpret the receipt's content.");
    }
}

// Route to handle receipt upload and EXTRACT data
router.post('/upload-receipt', isLoggedIn, upload.single('receipt'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        // Returns the extracted data
        const { amount, date, category } = await extractTextFromImage(req.file.buffer, req.file.mimetype);

        if (!amount || !date || !category) {
            return res.status(400).json({ message: 'Could not extract all required fields from the receipt.' });
        }

        // Send the extracted data back to the frontend for confirmation
        res.status(200).json({
            type: 'expense',
            description: 'Transaction from receipt', // A default description
            amount,
            date,
            category
        });

    } catch (error) {
        console.error('Error processing receipt:', error);
        res.status(500).json({ message: error.message || 'An internal server error occurred while processing the receipt.' });
    }
});

// PDF Route Using Gemini API
router.post('/import-pdf', isLoggedIn, upload.single('pdf'), async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'No file was uploaded.' });
    }
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ message: "Server is missing the Gemini API key." });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const pdfFile = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype,
            },
        };
        
        const prompt = `
            Analyze the provided PDF document. Extract all rows from the transaction table.
            For each row, provide the "Commodity" as description, "Category", "Date", and "Price".
            Determine if the transaction is "income" or "expense" from the "Type" column (Credit/Debit).
            Return the data as a clean JSON array of objects, where each object has keys: "description", "category", "date", "amount", and "type".
            The amount should be a positive number. Do not include the header row in your output.
        `;

        const result = await model.generateContent([prompt, pdfFile]);
        const responseText = result.response.text();
        
        // Clean the response to ensure it's valid JSON
        const jsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const transactions = JSON.parse(jsonText);

        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ message: 'Gemini could not extract any transactions from this PDF.' });
        }
        
        res.status(200).json(transactions);

    } catch (error) {
        console.error('Error processing PDF with Gemini:', error); 
        res.status(500).json({ message: 'The AI model could not process this PDF. It may be in an unsupported format or corrupted.' });
    }
});

// Route to add multiple transactions from the PDF confirmation
router.post('/add-multiple', isLoggedIn, async (req, res) => {
    try {
        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ message: 'No transactions provided.' });
        }

        const savedTransactions = [];
        for (const t of transactions) {
            // Find or create a category for the transaction
            let category = await Category.findOne({ name: t.category || 'Other', user: req.user.id });
            if (!category) {
                category = new Category({ name: t.category || 'Other', user: req.user.id });
                await category.save();
            }

            const newTransaction = new Transaction({
                user: req.user.id,
                type: t.type,
                description: t.description,
                amount: t.amount,
                date: t.date,
                category: category._id,
            });
            const saved = await newTransaction.save();
            savedTransactions.push(saved);
        }

        res.status(201).json(savedTransactions);

    } catch (error) {
        console.error('Error adding multiple transactions:', error);
        res.status(500).json({ message: 'Server error while adding transactions.' });
    }
});

// GET /api/transactions
// Get all transactions for a user with filtering and pagination
router.get('/', isLoggedIn, async (req, res) => {
  try {
    const { type, category: categoryName, dateRange, page = 1, limit = 10 } = req.query;
  
    const filter = { user: req.user.id };

    // Apply type filter
    if (type && type !== 'all') {
      filter.type = type;
    }

    // Apply category filter
    if (categoryName && categoryName !== 'all') {
      // Find the category ID from its name
      const category = await Category.findOne({ name: categoryName, user: req.user.id });
      if (category) {
        filter.category = category._id;
      } else {
        // If category doesn't exist for the user, return no transactions
        return res.json({ transactions: [], currentPage: 1, totalPages: 0 });
      }
    }
    
    // Apply date range filter 
    if (dateRange && dateRange !== 'all') {
        const startDate = new Date();
        if (dateRange === 'week') {
            startDate.setDate(startDate.getDate() - 7);
        } else if (dateRange === 'month') {
            startDate.setMonth(startDate.getMonth() - 1);
        } else if (dateRange === '3months') {
            startDate.setMonth(startDate.getMonth() - 3);
        }
        filter.date = { $gte: startDate };
    }

    // Pagination Logic
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get the total number of documents that match the filter
    const totalTransactions = await Transaction.countDocuments(filter);
    
    // Calculate the total number of pages
    const totalPages = Math.ceil(totalTransactions / limitNum);

    // Fetch the paginated transactions from the database
    const transactions = await Transaction.find(filter)
      .sort({ date: -1 })
      .populate('category')
      .skip(skip)
      .limit(limitNum);

    // Return response with transaction data and pagination info
    res.status(200).json({
      transactions,
      currentPage: pageNum,
      totalPages,
      totalTransactions
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/transactions
// Add a new transaction
router.post('/', isLoggedIn, async (req, res) => {
    try {
        const { type, description, amount, date, category: categoryName } = req.body;
        if (!type || !description || !amount || !date || !categoryName) {
            return res.status(400).json({ message: 'Please provide all required fields.' });
        }

        let category = await Category.findOne({ name: categoryName, user: req.user.id });
        if (!category) {
            category = new Category({ name: categoryName, user: req.user.id });
            await category.save();
        }

        const newTransaction = new Transaction({
            user: req.user.id,
            type,
            description,
            amount,
            date,
            category: category._id
        });

        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Route to DELETE a transaction
router.delete('/:id', isLoggedIn, async (req, res) => {
    try {
        const transactionId = req.params.id;

        // Ensure the transaction belongs to the logged-in user before deleting
        const transaction = await Transaction.findOneAndDelete({ 
            _id: transactionId, 
            user: req.user.id 
        });

        if (!transaction) {
            // If no transaction was found/deleted, it either doesn't exist, or doesn't belong to the user
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        res.status(200).json({ message: 'Transaction deleted successfully.' });

    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ message: 'Server error while deleting transaction.' });
    }
});

// GET /api/transactions/categories
// Get all unique categories for a user
router.get('/categories', isLoggedIn, async (req, res) => {
    try {
        const categories = await Category.find({ user: req.user.id }).distinct('name');
        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server error while fetching categories.' });
    }
});

module.exports = router;