// Finnhub Stock Data API Endpoint
// This endpoint fetches real stock data and returns it to the front-end

const FINNHUB_API_KEY = 'd4fj4a9r01qufc4uqkjgd4fj4a9r01qufc4uqkk0'; 

export default async function handler(req, res) {
  // Enable CORS for all origins
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol, endpoint } = req.method === 'GET' ? req.query : req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol is required' });
    }

    // Default to quote if no endpoint specified
    const apiEndpoint = endpoint || 'quote';
    
    // Construct Finnhub API URL
    let finnhubUrl;
    
    switch (apiEndpoint) {
      case 'quote':
        // Real-time quote (price, change, etc.)
        finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
        break;
        
      case 'profile':
        // Company profile (description, industry, etc.)
        finnhubUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
        break;
        
      case 'metrics':
        // Basic financials (P/E ratio, market cap, etc.)
        finnhubUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol.toUpperCase()}&metric=all&token=${FINNHUB_API_KEY}`;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid endpoint' });
    }

    // Fetch from Finnhub
    const finnhubResponse = await fetch(finnhubUrl);
    
    if (!finnhubResponse.ok) {
      const errorData = await finnhubResponse.json();
      return res.status(finnhubResponse.status).json({ 
        error: 'Finnhub API error', 
        details: errorData 
      });
    }

    const data = await finnhubResponse.json();
    
    // Return the data
    return res.status(200).json(data);

  } catch (error) {
    console.error('Stock data error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch stock data',
      message: error.message 
    });
  }
}
