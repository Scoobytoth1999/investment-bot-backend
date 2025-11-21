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
    const { symbol, range } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol required. Usage: ?symbol=AAPL&range=1Y' });
    }

    // Calculate date range
    const to = Math.floor(Date.now() / 1000); // Current time in Unix
    let from;
    
    switch (range) {
      case '1M':
        from = to - (30 * 24 * 60 * 60);
        break;
      case '3M':
        from = to - (90 * 24 * 60 * 60);
        break;
      case '6M':
        from = to - (180 * 24 * 60 * 60);
        break;
      case '1Y':
        from = to - (365 * 24 * 60 * 60);
        break;
      case '5Y':
        from = to - (5 * 365 * 24 * 60 * 60);
        break;
      default:
        from = to - (365 * 24 * 60 * 60);
    }

    // Fetch candle data from Finnhub
    const finnhubUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol.toUpperCase()}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    
    const response = await fetch(finnhubUrl);
    const data = await response.json();

    // Return the raw response for debugging
    return res.status(200).json({
      debug: true,
      requestedSymbol: symbol,
      requestedRange: range,
      from: from,
      to: to,
      url: finnhubUrl.replace(FINNHUB_API_KEY, 'API_KEY_HIDDEN'),
      finnhubResponse: data
    });

  } catch (error) {
    console.error('Historical data error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
};
