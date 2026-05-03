/**
 * Product Service
 * Handles business logic for product search, data transformation, and health score calculation
 */

const axios = require('axios');
const { parseAdditives } = require('../utils/chemicalCodes');

// Open Food Facts API base URLs
const OFF_API_BASE = 'https://world.openfoodfacts.org';
const SEARCH_URL = `${OFF_API_BASE}/api/v2/search`;
const PRODUCT_URL = `${OFF_API_BASE}/api/v2/product`;

/**
 * Calculate health score based on product data
 * Score ranges from 0-100
 * @param {object} product - Product data from API
 * @returns {number} Health score (0-100)
 */
function calculateHealthScore(product) {
    let score = 50; // Base score

    // 1. Nutri-Score contribution (if available)
    const nutriScore = product.nutriscore_grade || product.nutrition_grades;
    if (nutriScore) {
        const nutriScoreMap = {
            'a': 95,
            'b': 80,
            'c': 60,
            'd': 40,
            'e': 20
        };
        score = nutriScoreMap[nutriScore.toLowerCase()] || score;
    }

    // 2. NOVA group penalty (ultra-processed foods)
    const novaGroup = product.nova_group;
    if (novaGroup) {
        const novaPenalty = {
            1: 0,    // Unprocessed
            2: -5,   // Processed culinary ingredients
            3: -10,  // Processed foods
            4: -20   // Ultra-processed
        };
        score += novaPenalty[novaGroup] || 0;
    }

    // 3. Additives penalty
    const additives = product.additives_tags || [];
    const additiveCount = additives.length;
    if (additiveCount > 0) {
        // -2 points per additive, max -20
        score -= Math.min(additiveCount * 2, 20);
    }

    // 4. High risk additives check
    const highRiskAdditives = ['e171', 'e250', 'e251', 'e252', 'e320', 'e321', 'e123', 'e952'];
    additives.forEach(additive => {
        const code = additive.replace('en:', '').toLowerCase();
        if (highRiskAdditives.some(hr => code.includes(hr))) {
            score -= 5; // Extra penalty for high-risk additives
        }
    });

    // 5. Nutrient-based adjustments
    const nutrients = product.nutriments || {};

    // Penalty for high sugar
    const sugar = nutrients.sugars_100g;
    if (sugar > 22.5) score -= 10;
    else if (sugar > 12.5) score -= 5;

    // Penalty for high saturated fat
    const satFat = nutrients['saturated-fat_100g'];
    if (satFat > 5) score -= 10;
    else if (satFat > 2.5) score -= 5;

    // Penalty for high sodium
    const sodium = nutrients.sodium_100g;
    if (sodium > 1.5) score -= 10;
    else if (sodium > 0.6) score -= 5;

    // Bonus for fiber
    const fiber = nutrients.fiber_100g;
    if (fiber > 6) score += 10;
    else if (fiber > 3) score += 5;

    // Bonus for protein
    const protein = nutrients.proteins_100g;
    if (protein > 8) score += 5;

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Transform raw API product data into clean format
 * @param {object} rawProduct - Raw product data from Open Food Facts
 * @returns {object} Cleaned product data
 */
function transformProduct(rawProduct) {
    // Parse additives with readable names
    const additivesTags = rawProduct.additives_tags || [];
    const parsedAdditives = parseAdditives(additivesTags.map(a => a.replace('en:', '')));

    // Extract allergens
    const allergensFromTags = (rawProduct.allergens_tags || []).map(a =>
        a.replace('en:', '').replace(/-/g, ' ')
    );
    const allergensFromHierarchy = (rawProduct.allergens_hierarchy || []).map(a =>
        a.replace('en:', '').replace(/-/g, ' ')
    );
    const allergens = [...new Set([...allergensFromTags, ...allergensFromHierarchy])];

    // Calculate health score
    const healthScore = calculateHealthScore(rawProduct);

    return {
        id: rawProduct.code || rawProduct._id,
        name: rawProduct.product_name || rawProduct.product_name_en || 'Unknown Product',
        brand: rawProduct.brands || 'Unknown Brand',
        image: rawProduct.image_url || rawProduct.image_front_url || null,
        imageLarge: rawProduct.image_front_url || rawProduct.image_url || null,
        ingredients: rawProduct.ingredients_text || rawProduct.ingredients_text_en || 'Ingredients not available',
        ingredientsList: (rawProduct.ingredients || []).map(ing => ({
            name: ing.text || ing.id,
            percent: ing.percent_estimate || null
        })),
        allergens: allergens,
        allergensText: rawProduct.allergens || '',
        healthRating: rawProduct.nutriscore_grade || rawProduct.nutrition_grades || 'N/A',
        healthScore: healthScore,
        novaGroup: rawProduct.nova_group || null,
        additives: parsedAdditives,
        nutrients: {
            energy: rawProduct.nutriments?.energy_100g || null,
            energyUnit: rawProduct.nutriments?.energy_unit || 'kJ',
            fat: rawProduct.nutriments?.fat_100g || null,
            saturatedFat: rawProduct.nutriments?.['saturated-fat_100g'] || null,
            carbs: rawProduct.nutriments?.carbohydrates_100g || null,
            sugars: rawProduct.nutriments?.sugars_100g || null,
            fiber: rawProduct.nutriments?.fiber_100g || null,
            proteins: rawProduct.nutriments?.proteins_100g || null,
            salt: rawProduct.nutriments?.salt_100g || null,
            sodium: rawProduct.nutriments?.sodium_100g || null
        },
        categories: rawProduct.categories || '',
        quantity: rawProduct.quantity || '',
        packaging: rawProduct.packaging || ''
    };
}

/**
 * Search products by name
 * @param {string} query - Search query
 * @param {number} page - Page number (1-indexed)
 * @param {number} pageSize - Items per page
 * @returns {Promise<object>} Search results with products and pagination info
 */
async function searchProducts(query, page = 1, pageSize = 20) {
    try {
        const response = await axios.get(SEARCH_URL, {
            params: {
                search_terms: query,
                page: page,
                page_size: pageSize,
                fields: 'code,product_name,product_name_en,brands,image_url,image_front_url,nutriscore_grade,nutrition_grades'
            },
            headers: {
                'User-Agent': 'FoodCompliance/1.0 (https://food-compliance-checker-512442756526.asia-south1.run.app; contact: support@foodcompliance.app)'
            },
            timeout: 15000
        });

        const data = response.data;
        const products = (data.products || []).map(p => ({
            id: p.code,
            name: p.product_name || p.product_name_en || 'Unknown Product',
            brand: p.brands || '',
            image: p.image_url || p.image_front_url || null,
            healthRating: p.nutriscore_grade || p.nutrition_grades || null
        }));

        return {
            products: products,
            totalCount: data.count || 0,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil((data.count || 0) / pageSize)
        };
    } catch (error) {
        console.error('Error searching products:', error.message);
        throw new Error('Failed to search products. Please try again.');
    }
}

/**
 * Get product by barcode
 * @param {string} barcode - Product barcode
 * @returns {Promise<object|null>} Product data or null if not found
 */
async function getProductByBarcode(barcode) {
    try {
        const response = await axios.get(`${PRODUCT_URL}/${barcode}.json`, {
            headers: {
                'User-Agent': 'FoodCompliance/1.0 (https://food-compliance-checker-512442756526.asia-south1.run.app; contact: support@foodcompliance.app)'
            },
            timeout: 15000
        });

        const data = response.data;

        if (data.status === 0 || !data.product) {
            return null; // Product not found
        }

        return transformProduct(data.product);
    } catch (error) {
        console.error('Error fetching product by barcode:', error.message);
        throw new Error('Failed to fetch product. Please try again.');
    }
}

/**
 * Get product details by ID (same as barcode for Open Food Facts)
 * @param {string} productId - Product ID/barcode
 * @returns {Promise<object|null>} Product data or null if not found
 */
async function getProductById(productId) {
    return getProductByBarcode(productId);
}

module.exports = {
    searchProducts,
    getProductByBarcode,
    getProductById,
    calculateHealthScore,
    transformProduct
};
