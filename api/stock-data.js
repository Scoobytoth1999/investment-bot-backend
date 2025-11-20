const fetch = require('node-fetch');

const FINNHUB_API_KEY = 'd4fj4a9r01qufc4uqkjgd4fj4a9r01qufc4uqkk0';

module.exports = async (req, res) => {
  // Enable CORS for all origins
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get stock symbol from query
    const { symbol } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol required. Usage: ?symbol=AAPL' });
    }

    // Fetch from Finnhub API
    const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
    
    const response = await fetch(finnhubUrl);
    const data = await response.json();

    // Return the response
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('Stock data error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
