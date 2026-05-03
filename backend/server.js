/**
 * Food Compliance Checker - Backend Server
 * Express.js server providing REST API for product search and compliance checking
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const productRoutes = require('./routes/productRoutes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
// Enable CORS for frontend communication
app.use(cors({
    origin: isProduction ? false : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files in production
if (isProduction) {
    app.use(express.static(path.join(__dirname, 'public')));
}

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/products', productRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    if (isProduction) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.json({
            message: 'Food Compliance Checker API',
            version: '1.0.0',
            endpoints: {
                health: '/api/health',
                searchProducts: '/api/products/search?query=<name>&page=<num>',
                getByBarcode: '/api/products/barcode/:code',
                getById: '/api/products/:id'
            }
        });
    }
});

// SPA fallback - serve index.html for all other routes in production
if (isProduction) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.path} does not exist`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     Food Compliance Checker - Backend Server               ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║  API Base URL:      http://localhost:${PORT}/api              ║
║  Environment:       ${process.env.NODE_ENV || 'development'}                          ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
