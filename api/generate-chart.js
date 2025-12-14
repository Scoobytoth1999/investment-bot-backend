const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Enable CORS for all origins
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbols, range = '1Y' } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ 
        error: 'Stock symbols required', 
        usage: 'POST body: { symbols: ["AAPL", "GOOGL"], range: "1Y" }' 
      });
    }

    // Validate symbols (max 5 for comparison)
    if (symbols.length > 5) {
      return res.status(400).json({ 
        error: 'Maximum 5 symbols allowed for comparison' 
      });
    }

    // Fetch data for all symbols
    const stockDataPromises = symbols.map(symbol => fetchStockData(symbol, range));
    const stockDataResults = await Promise.allSettled(stockDataPromises);
    
    // Filter successful fetches
    const validStockData = [];
    const errors = [];
    
    stockDataResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        validStockData.push({
          symbol: symbols[index],
          data: result.value.data,
          debug: result.value.debug
        });
      } else {
        errors.push({
          symbol: symbols[index],
          error: result.reason || result.value.error
        });
      }
    });

    if (validStockData.length === 0) {
      return res.status(404).json({ 
        error: 'No valid stock data found',
        details: errors
      });
    }

    // Generate chart configuration
    const chartConfig = createChartConfig(validStockData, range);
    
    // Use QuickChart.io to generate the chart
    const quickChartUrl = 'https://quickchart.io/chart';
    const chartResponse = await fetch(quickChartUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chart: chartConfig,
        width: 900,
        height: 450,
        devicePixelRatio: 2,
        backgroundColor: 'white',
        format: 'png'
      })
    });

    if (!chartResponse.ok) {
      throw new Error('Failed to generate chart from QuickChart');
    }

    // Get the image as base64
    const imageBuffer = await chartResponse.buffer();
    const base64Image = imageBuffer.toString('base64');
    
    // Return as JSON with base64 image and debug info
    res.status(200).json({
      success: true,
      image: `data:image/png;base64,${base64Image}`,
      symbols: validStockData.map(s => s.symbol),
      range: range,
      debug: validStockData.map(s => ({
        symbol: s.symbol,
        dataPoints: s.data.length,
        startDate: s.data[0]?.date,
        endDate: s.data[s.data.length - 1]?.date,
        startPrice: s.data[0]?.price,
        endPrice: s.data[s.data.length - 1]?.price
      }))
    });

  } catch (error) {
    console.error('Chart generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate chart',
      message: error.message
    });
  }
};

async function fetchStockData(symbol, range) {
  try {
    // Get current time in milliseconds
    const now = Date.now();
    const nowUnix = Math.floor(now / 1000);
    
    // Calculate the start date based on range
    let period1;
    const secondsPerDay = 24 * 60 * 60;
    
    switch (range) {
      case '1M':
        period1 = nowUnix - (30 * secondsPerDay);
        break;
      case '3M':
        period1 = nowUnix - (90 * secondsPerDay);
        break;
      case '6M':
        period1 = nowUnix - (182 * secondsPerDay);
        break;
      case '1Y':
        period1 = nowUnix - (365 * secondsPerDay);
        break;
      case '5Y':
        period1 = nowUnix - (5 * 365 * secondsPerDay);
        break;
      default:
        period1 = nowUnix - (365 * secondsPerDay);
    }

    // Always use daily interval for most ranges
    let interval = '1d';
    if (range === '5Y') {
      interval = '1wk'; // Weekly for 5 years to reduce data points
    }

    // Fetch from Yahoo Finance API
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?period1=${period1}&period2=${nowUnix}&interval=${interval}&includePrePost=false`;
    
    console.log(`Fetching ${symbol} from: ${new Date(period1 * 1000).toISOString()} to ${new Date(nowUnix * 1000).toISOString()}`);
    
    const response = await fetch(yahooUrl);
    const data = await response.json();

    if (!response.ok || data.chart.error) {
      console.error(`Yahoo API error for ${symbol}:`, data.chart?.error);
      return {
        success: false,
        error: data.chart?.error?.description || 'Failed to fetch data'
      };
    }

    const result = data.chart.result[0];
    
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      console.error(`Invalid data structure for ${symbol}`);
      return {
        success: false,
        error: 'Invalid data structure received'
      };
    }
    
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    // Create clean data, keeping only valid prices
    const cleanData = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (prices[i] !== null && prices[i] !== undefined && !isNaN(prices[i])) {
        cleanData.push({
          date: new Date(timestamps[i] * 1000),
          price: parseFloat(prices[i].toFixed(2))
        });
      }
    }

    // Sort by date to ensure correct order
    cleanData.sort((a, b) => a.date - b.date);

    console.log(`${symbol}: Fetched ${cleanData.length} valid data points`);

    return {
      success: true,
      data: cleanData,
      debug: {
        totalPoints: timestamps.length,
        cleanPoints: cleanData.length,
        interval: interval,
        dateRange: `${new Date(period1 * 1000).toLocaleDateString()} to ${new Date(nowUnix * 1000).toLocaleDateString()}`
      }
    };

  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

function createChartConfig(stockData, range) {
  // For multiple stocks (comparison)
  if (stockData.length > 1) {
    const datasets = [];
    const colors = [
      'rgb(54, 162, 235)',   // Blue
      'rgb(255, 99, 132)',   // Red
      'rgb(75, 192, 192)',   // Teal
      'rgb(255, 206, 86)',   // Yellow
      'rgb(153, 102, 255)'   // Purple
    ];

    stockData.forEach((stock, index) => {
      if (stock.data.length === 0) return;
      
      const firstPrice = stock.data[0].price;
      const labels = [];
      const percentageData = [];
      
      // Sample data for cleaner chart
      const step = Math.max(1, Math.floor(stock.data.length / 50));
      for (let i = 0; i < stock.data.length; i += step) {
        labels.push(stock.data[i].date.toISOString().split('T')[0]);
        percentageData.push(((stock.data[i].price - firstPrice) / firstPrice * 100).toFixed(2));
      }

      datasets.push({
        label: stock.symbol,
        data: percentageData,
        borderColor: colors[index % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        fill: false,
        tension: 0.1
      });
    });

    return {
      type: 'line',
      data: {
        labels: stockData[0].data.filter((_, i) => i % Math.max(1, Math.floor(stockData[0].data.length / 50)) === 0)
                                 .map(d => d.date.toISOString().split('T')[0]),
        datasets: datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          title: {
            display: true,
            text: `Stock Comparison - % Change (${range})`
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            title: {
              display: true,
              text: 'Percentage Change (%)'
            }
          }
        }
      }
    };
  }
  
  // For single stock
  const stock = stockData[0];
  if (stock.data.length === 0) return {};
  
  // Create arrays for labels and prices
  const labels = [];
  const prices = [];
  
  // Sample the data - take every Nth point to avoid overcrowding
  const step = Math.max(1, Math.floor(stock.data.length / 50)); // Aim for ~50 points max
  
  for (let i = 0; i < stock.data.length; i += step) {
    labels.push(stock.data[i].date.toISOString().split('T')[0]);
    prices.push(stock.data[i].price);
  }
  
  // Always include the last point for accuracy
  if (stock.data.length > 0 && stock.data.length % step !== 0) {
    labels.push(stock.data[stock.data.length - 1].date.toISOString().split('T')[0]);
    prices.push(stock.data[stock.data.length - 1].price);
  }

  // Calculate min and max for better visibility
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1;

  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${stock.symbol} Price`,
        data: prices,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: prices.length > 50 ? 0 : 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: `${stock.symbol} - ${range} Chart`
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          },
          ticks: {
            maxTicksLimit: 10,
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          display: true,
          beginAtZero: false,
          suggestedMin: minPrice - padding,
          suggestedMax: maxPrice + padding,
          title: {
            display: true,
            text: 'Price ($)'
          },
          ticks: {
            callback: function(value) {
              return '$' + value.toFixed(0);
            }
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  };
}