// routes/trading.js - Trading API routes
const express = require('express');
const router = express.Router();
const groqService = require('../services/groqService');
const baseTokensService = require('../services/baseTokensService');

// Parse trading strategy
router.post('/parse-strategy', async (req, res) => {
  try {
    const { strategy } = req.body;
    
    if (!strategy) {
      return res.status(400).json({ error: 'Strategy text required' });
    }

    console.log('Parsing strategy:', strategy);
    const parsedStrategy = await groqService.parseStrategy(strategy);
    
    res.json({
      success: true,
      strategy: parsedStrategy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Strategy parsing error:', error);
    res.status(500).json({ 
      error: 'Failed to parse strategy',
      message: error.message 
    });
  }
});

// Generate trading signal (legacy endpoint)
router.post('/signal', async (req, res) => {
  try {
    const { symbol, strategy } = req.body;
    
    if (!symbol || !strategy) {
      return res.status(400).json({ error: 'Symbol and strategy required' });
    }

    console.log(`Generating signal for ${symbol}`);
    
    // Get market data
    const marketData = await baseTokensService.getBaseTokenPrice(symbol);
    
    // Analyze with Groq
    const signal = await groqService.analyzeMarketConditions(marketData, strategy);
    
    res.json({
      success: true,
      symbol,
      signal,
      marketData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Signal generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate signal',
      message: error.message 
    });
  }
});

// Get trading insight
router.get('/insight/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h' } = req.query;
    
    console.log(`Getting insight for ${symbol}`);
    
    const insight = await groqService.generateTradingInsight(symbol, timeframe);
    
    res.json({
      success: true,
      symbol,
      timeframe,
      insight,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Insight generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate insight',
      message: error.message 
    });
  }
});

// Test Groq connection
router.get('/test-groq', async (req, res) => {
  try {
    const testStrategy = "Buy when RSI is below 30 and sell when above 70";
    const result = await groqService.parseStrategy(testStrategy);
    
    res.json({
      success: true,
      message: 'Groq connection working',
      test_result: result
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Groq connection failed',
      message: error.message 
    });
  }
});

// Get Base network tokens
router.get('/base-tokens', async (req, res) => {
  try {
    const tokens = baseTokensService.getAllBaseTokens();
    res.json({
      success: true,
      count: tokens.length,
      tokens: tokens.map(symbol => ({
        symbol,
        ...baseTokensService.getTokenInfo(symbol)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Base tokens' });
  }
});

// Get Base token price
router.get('/base-price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!baseTokensService.isBaseToken(symbol)) {
      return res.status(404).json({ 
        error: `${symbol} not available on Base network`,
        availableTokens: baseTokensService.getAllBaseTokens().slice(0, 10)
      });
    }

    const priceData = await baseTokensService.getBaseTokenPrice(symbol);
    
    res.json({
      success: true,
      data: priceData
    });

  } catch (error) {
    console.error(`Base price error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      error: 'Failed to get Base token price',
      message: error.message 
    });
  }
});

// Get top Base tokens by volume
router.get('/base-top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const topTokens = await baseTokensService.getTopBaseTokens(parseInt(limit));
    
    res.json({
      success: true,
      count: topTokens.length,
      data: topTokens
    });

  } catch (error) {
    console.error('Top Base tokens error:', error);
    res.status(500).json({ 
      error: 'Failed to get top Base tokens' 
    });
  }
});

// Get trending Base tokens
router.get('/base-trending', async (req, res) => {
  try {
    const trending = await baseTokensService.getBaseTrendingTokens();
    
    res.json({
      success: true,
      count: trending.length,
      data: trending
    });

  } catch (error) {
    console.error('Trending Base tokens error:', error);
    res.status(500).json({ 
      error: 'Failed to get trending Base tokens' 
    });
  }
});

// Get Base ecosystem strategies
router.get('/base-strategies', (req, res) => {
  try {
    const strategies = baseTokensService.getBaseEcosystemStrategies();
    
    res.json({
      success: true,
      strategies
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Base strategies' });
  }
});

// Generate Base-specific trading signal
router.post('/base-signal', async (req, res) => {
  try {
    const { symbol, strategy } = req.body;
    
    if (!symbol || !strategy) {
      return res.status(400).json({ error: 'Symbol and strategy required' });
    }
    
    if (!baseTokensService.isBaseToken(symbol)) {
      return res.status(400).json({ 
        error: `${symbol} not available on Base network`,
        availableTokens: baseTokensService.getAllBaseTokens().slice(0, 10)
      });
    }

    console.log(`Generating Base signal for ${symbol}`);
    
    // Get Base-specific market data
    const basePrice = await baseTokensService.getBaseTokenPrice(symbol);
    
    // Parse strategy if it's a string
    let parsedStrategy = strategy;
    if (typeof strategy === 'string') {
      parsedStrategy = await groqService.parseStrategy(strategy);
    }
    
    // Analyze with Groq
    const signal = await groqService.analyzeMarketConditions(basePrice, parsedStrategy);
    
    res.json({
      success: true,
      symbol,
      network: 'base',
      signal,
      marketData: basePrice,
      strategy: parsedStrategy,
      tokenInfo: baseTokensService.getTokenInfo(symbol),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Base signal generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate Base signal',
      message: error.message 
    });
  }
});

module.exports = router;