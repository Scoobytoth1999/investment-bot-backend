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
          data: result.value.data
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
        width: 800,
        height: 400,
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
    
    // Return as JSON with base64 image
    res.status(200).json({
      success: true,
      image: `data:image/png;base64,${base64Image}`,
      symbols: validStockData.map(s => s.symbol),
      range: range
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
      return {
        success: false,
        error: 'Failed to fetch data'
      };
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    // Filter out null values and create clean data
    const cleanData = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (prices[i] !== null) {
        cleanData.push({
          date: new Date(timestamps[i] * 1000),
          price: prices[i]
        });
      }
    }

    return {
      success: true,
      data: cleanData
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function createChartConfig(stockData, range) {
  // Prepare datasets
  const datasets = [];
  const colors = [
    'rgb(255, 99, 132)',   // Red
    'rgb(54, 162, 235)',   // Blue
    'rgb(75, 192, 192)',   // Teal
    'rgb(255, 206, 86)',   // Yellow
    'rgb(153, 102, 255)'   // Purple
  ];

  // Determine if this is a comparison chart
  const isComparison = stockData.length > 1;

  // For comparison charts, normalize to percentage change
  if (isComparison) {
    stockData.forEach((stock, index) => {
      const firstPrice = stock.data[0].price;
      const normalizedData = stock.data.map(point => ({
        x: point.date.toISOString().split('T')[0],
        y: ((point.price - firstPrice) / firstPrice) * 100
      }));

      datasets.push({
        label: stock.symbol,
        data: normalizedData,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '33',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 5
      });
    });
  } else {
    // For single stock
    const stock = stockData[0];
    const chartData = stock.data.map(point => ({
      x: point.date.toISOString().split('T')[0],
      y: point.price
    }));

    datasets.push({
      label: stock.symbol,
      data: chartData,
      borderColor: colors[0],
      backgroundColor: colors[0] + '33',
      borderWidth: 2,
      fill: true,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 5
    });
  }

  // Create the chart configuration for QuickChart
  return {
    type: 'line',
    data: {
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: {
              size: 14
            },
            usePointStyle: true
          }
        },
        title: {
          display: true,
          text: isComparison 
            ? `Stock Comparison - % Change (${range})`
            : `${stockData[0].symbol} Price Chart (${range})`,
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: range === '1M' ? 'day' : range === '3M' ? 'week' : 'month'
          },
          title: {
            display: true,
            text: 'Date',
            font: {
              size: 12
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          title: {
            display: true,
            text: isComparison ? 'Percentage Change (%)' : 'Price ($)',
            font: {
              size: 12
            }
          },
          ticks: {
            callback: function(value) {
              if (isComparison) {
                return value.toFixed(1) + '%';
              } else {
                return '$' + value.toFixed(0);
              }
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
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