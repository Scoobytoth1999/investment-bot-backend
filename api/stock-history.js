const fetch = require('node-fetch');

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
    const now = Math.floor(Date.now() / 1000);
    let period1;
    
    switch (range) {
      case '1M':
        period1 = now - (30 * 24 * 60 * 60);
        break;
      case '3M':
        period1 = now - (90 * 24 * 60 * 60);
        break;
      case '6M':
        period1 = now - (180 * 24 * 60 * 60);
        break;
      case '1Y':
        period1 = now - (365 * 24 * 60 * 60);
        break;
      case '5Y':
        period1 = now - (5 * 365 * 24 * 60 * 60);
        break;
      default:
        period1 = now - (365 * 24 * 60 * 60);
    }

    // Fetch from Yahoo Finance API
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?period1=${period1}&period2=${now}&interval=1d`;
    
    const response = await fetch(yahooUrl);
    const data = await response.json();

    if (!response.ok || data.chart.error) {
      return res.status(404).json({ 
        error: 'No historical data found for this symbol',
        details: data.chart?.error
      });
    }

    // Extract the data
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    // Format response similar to Finnhub
    return res.status(200).json({
      s: 'ok',
      t: timestamps,
      c: prices,
      symbol: symbol.toUpperCase(),
      range: range
    });

  } catch (error) {
    console.error('Historical data error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
};
