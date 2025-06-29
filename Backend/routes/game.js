// routes/game.js - Updated with Strategy ID Management
const express = require('express');
const router = express.Router();
const tradingRoundManager = require('../services/tradingRoundManager');
const strategyManager = require('../services/strategyManager');
const redisService = require('../services/redisService');
const groqService = require('../services/groqService');
// Create a new trading round
router.post('/create-round', async (req, res) => {
  try {
    const config = {
      title: req.body.title,
      description: req.body.description,
      duration: req.body.duration ? parseInt(req.body.duration) * 1000 : undefined,
      startingBalance: req.body.startingBalance ? parseFloat(req.body.startingBalance) : undefined,
      maxParticipants: req.body.maxParticipants ? parseInt(req.body.maxParticipants) : undefined,
      executionInterval: req.body.executionInterval ? parseInt(req.body.executionInterval) * 1000 : undefined,
      allowedTokens: req.body.allowedTokens,
      autoStart: req.body.autoStart,
      minParticipants: req.body.minParticipants ? parseInt(req.body.minParticipants) : undefined,
      createdBy: req.body.createdBy || 'api'
    };

    const round = await tradingRoundManager.createRound(config);
    
    res.json({
      success: true,
      round,
      message: 'Trading round created successfully'
    });

  } catch (error) {
    console.error('Create round error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create round',
      message: error.message
    });
  }
});
// Add these routes to your existing routes/game.js file

// AI-Powered Game Creation
router.post('/create-game-from-prompt', async (req, res) => {
  try {
    const { 
      query, 
      maxParticipants = 10,
      minParticipants = 2,
      duration = 180,
      startingBalance = 10000,
      executionInterval = 15,
      autoStart = true,
      createdBy = 'ai-prompt'
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query prompt is required'
      });
    }

    console.log(`🤖 Processing AI game creation prompt: "${query}"`);
    
    // Parse the prompt with AI to extract game configuration
    const gameConfig = await parseGamePrompt(query);
    
    // Create the trading round with extracted configuration
    const roundConfig = {
      title: gameConfig.title || generateGameTitle(gameConfig),
      description: gameConfig.description || `AI-generated game: ${query.slice(0, 100)}...`,
      duration: (gameConfig.duration || duration) * 1000, // Convert to milliseconds
      startingBalance: gameConfig.startingBalance || startingBalance,
      maxParticipants,
      minParticipants,
      executionInterval: (gameConfig.executionInterval || executionInterval) * 1000,
      allowedTokens: gameConfig.tokens || ['ETH', 'TOSHI', 'DEGEN'],
      autoStart,
      createdBy,
      // Add AI-specific metadata
      aiGenerated: true,
      originalPrompt: query,
      aiConfig: gameConfig
    };

    const round = await tradingRoundManager.createRound(roundConfig);
    
    res.json({
      success: true,
      round,
      aiConfig: gameConfig,
      suggestedStrategy: gameConfig.strategy,
      extractedData: {
        tokens: gameConfig.tokens,
        targetProfit: gameConfig.targetProfit,
        riskLevel: gameConfig.riskLevel,
        gameType: gameConfig.gameType
      },
      message: 'AI-powered game created successfully'
    });

  } catch (error) {
    console.error('AI game creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create AI-powered game',
      message: error.message
    });
  }
});

// Quick game templates
router.post('/get-game-templates', (req, res) => {
  const templates = [
    {
      id: 'trending-hunt',
      title: 'Trending Token Hunt',
      prompt: 'Create a 5-minute game to trade trending Base tokens with 10% profit target',
      description: 'Fast-paced trading of trending tokens',
      duration: 300,
      targetProfit: 10,
      riskLevel: 'high'
    },
    {
      id: 'stable-growth',
      title: 'Stable Growth Challenge',
      prompt: 'Create a 30-minute game focusing on ETH and major tokens with 5% profit target',
      description: 'Conservative trading with major tokens',
      duration: 1800,
      targetProfit: 5,
      riskLevel: 'low'
    },
    {
      id: 'defi-momentum',
      title: 'DeFi Momentum Play',
      prompt: 'Create a 15-minute game trading AERO, UNI, COMP with momentum strategy',
      description: 'DeFi token momentum trading',
      duration: 900,
      targetProfit: 7,
      riskLevel: 'medium'
    },
    {
      id: 'meme-madness',
      title: 'Meme Token Madness',
      prompt: 'Create a 10-minute game with TOSHI, DEGEN, BRETT for quick profits',
      description: 'High volatility meme token trading',
      duration: 600,
      targetProfit: 15,
      riskLevel: 'high'
    }
  ];

  res.json({
    success: true,
    templates,
    count: templates.length
  });
});

// Suggest strategy from prompt
router.post('/suggest-strategy-from-prompt', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const strategyPrompt = `
Based on this request, create a simple trading strategy:

Request: "${query}"

Create a strategy that matches the user's intent. Return just the strategy text (2-3 sentences max).
Focus on Base network tokens and clear rules.

Example: "Buy TOSHI when volume increases by 20%, sell when profit reaches 5% or loss hits 2%"
`;

    const strategy = await groqService.makeGroqRequest(async () => {
      const completion = await groqService.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a trading strategy advisor. Provide concise, actionable strategies.'
          },
          {
            role: 'user',
            content: strategyPrompt
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 200
      });

      return completion.choices[0]?.message?.content;
    });

    res.json({
      success: true,
      strategy: strategy.replace(/"/g, '').trim(),
      prompt: query
    });

  } catch (error) {
    console.error('Strategy suggestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest strategy',
      fallbackStrategy: "Buy trending tokens when volume increases, sell on 5-10% profit with 2% stop loss"
    });
  }
});

// Helper functions (add these at the end of the file)

// AI Prompt Parser Function
async function parseGamePrompt(query) {
  const prompt = `
Parse this game creation request and extract configuration:

User Request: "${query}"

Return ONLY this JSON format:
{
  "title": "extracted game title",
  "description": "game description", 
  "tokens": ["token1", "token2"],
  "duration": 180,
  "startingBalance": 10000,
  "executionInterval": 15,
  "strategy": "suggested trading strategy",
  "gameType": "trending/momentum/arbitrage/prediction",
  "targetProfit": 5,
  "riskLevel": "low/medium/high",
  "timeframe": "5m/15m/1h",
  "focus": "specific focus area"
}

Extract values from the request. Use these defaults if not mentioned:
- duration: 180 seconds
- startingBalance: 10000  
- tokens: ["ETH", "TOSHI", "DEGEN"]
- targetProfit: 5
- riskLevel: "medium"
`;

  try {
    const response = await groqService.makeGroqRequest(async () => {
      const completion = await groqService.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a game configuration parser. Always respond with valid JSON only.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 800
      });

      return completion.choices[0]?.message?.content;
    });

    return groqService.cleanAndParseJSON(response);
  } catch (error) {
    console.error('Prompt parsing error:', error);
    // Return default config if AI fails
    return {
      title: "AI Trading Game",
      description: "Generated from user prompt",
      tokens: ["ETH", "TOSHI", "DEGEN"],
      duration: 180,
      startingBalance: 10000,
      strategy: "Buy trending tokens and sell on profit",
      gameType: "trending",
      targetProfit: 5,
      riskLevel: "medium"
    };
  }
}

// Generate game title from configuration
function generateGameTitle(config) {
  const templates = [
    `${config.gameType?.charAt(0).toUpperCase() + config.gameType?.slice(1) || 'Trading'} Challenge`,
    `${config.targetProfit || 5}% Profit Hunt`,
    `${config.riskLevel?.charAt(0).toUpperCase() + config.riskLevel?.slice(1) || 'Medium'} Risk Battle`,
    `${config.tokens?.[0] || 'Multi-Token'} Trading Arena`,
    `AI ${config.focus || 'Strategy'} Game`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}
// Join a trading round with strategy options
router.post('/join-round', async (req, res) => {
  try {
    const { 
      roundId, 
      walletAddress, 
      strategy,           // New strategy text
      username, 
      strategyId,         // Existing strategy ID
      royaltyPercent,     // For new strategies
      licenseStrategyId   // License someone else's strategy
    } = req.body;
    
    if (!roundId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Round ID and wallet address are required'
      });
    }

    // Must have either strategy text, strategyId, or licenseStrategyId
    if (!strategy && !strategyId && !licenseStrategyId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide either strategy text, strategyId, or licenseStrategyId'
      });
    }

    const participant = await tradingRoundManager.joinRound(roundId, {
      walletAddress,
      strategy,
      username,
      strategyId,
      royaltyPercent,
      licenseStrategyId
    });
    
    res.json({
      success: true,
      participant,
      strategyId: participant.strategy.id,
      isLicensed: participant.strategy.isLicensed,
      message: 'Successfully joined the round'
    });

  } catch (error) {
    console.error('Join round error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to join round',
      message: error.message
    });
  }
});

// Register a new strategy
router.post('/register-strategy', async (req, res) => {
  try {
    const { walletAddress, strategy, royaltyPercent, name, description } = req.body;
    
    if (!walletAddress || !strategy) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address and strategy text are required'
      });
    }

    const registeredStrategy = await strategyManager.registerStrategy(
      walletAddress,
      strategy,
      royaltyPercent || 20,
      name,
      description
    );
    
    res.json({
      success: true,
      strategy: registeredStrategy,
      message: 'Strategy registered successfully'
    });

  } catch (error) {
    console.error('Register strategy error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to register strategy',
      message: error.message
    });
  }
});

// Get user's strategies
router.post('/get-user-strategies', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }
    
    const strategies = await tradingRoundManager.getUserStrategies(walletAddress);
    
    res.json({
      success: true,
      strategies,
      count: strategies.length
    });

  } catch (error) {
    console.error('Get user strategies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user strategies',
      message: error.message
    });
  }
});

// Get strategy marketplace (top strategies)
router.post('/get-marketplace', async (req, res) => {
  try {
    const { limit = 20 } = req.body;
    
    const strategies = await tradingRoundManager.getAvailableStrategies(parseInt(limit));
    
    res.json({
      success: true,
      strategies,
      count: strategies.length
    });

  } catch (error) {
    console.error('Get marketplace error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get marketplace',
      message: error.message
    });
  }
});

// Search strategies
router.post('/search-strategies', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const strategies = await tradingRoundManager.searchStrategies(query, parseInt(limit));
    
    res.json({
      success: true,
      strategies,
      count: strategies.length,
      query
    });

  } catch (error) {
    console.error('Search strategies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search strategies',
      message: error.message
    });
  }
});

// Get strategy details
router.post('/get-strategy', async (req, res) => {
  try {
    const { strategyId } = req.body;
    
    if (!strategyId) {
      return res.status(400).json({
        success: false,
        error: 'Strategy ID is required'
      });
    }
    
    const strategy = await strategyManager.getStrategy(strategyId);
    
    // Don't return the actual strategy text, just metadata
    const publicStrategy = {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      owner: strategy.owner,
      royaltyPercent: strategy.royaltyPercent,
      stats: strategy.stats,
      tags: strategy.tags,
      isActive: strategy.isActive,
      isVerified: strategy.isVerified,
      createdAt: strategy.createdAt
    };
    
    res.json({
      success: true,
      strategy: publicStrategy
    });

  } catch (error) {
    console.error('Get strategy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get strategy',
      message: error.message
    });
  }
});

// Start a round manually
router.post('/start-round', async (req, res) => {
  try {
    const { roundId } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const round = await tradingRoundManager.startRound(roundId);
    
    res.json({
      success: true,
      round,
      message: 'Round started successfully'
    });

  } catch (error) {
    console.error('Start round error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to start round',
      message: error.message
    });
  }
});

// Get round details
router.post('/get-round', async (req, res) => {
  try {
    const { roundId } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const round = await tradingRoundManager.getRound(roundId);
    if (!round) {
      return res.status(404).json({
        success: false,
        error: 'Round not found'
      });
    }

    const participantAddresses = await redisService.sMembers(`round:${roundId}:participants`);
    round.currentParticipants = participantAddresses.length;

    res.json({
      success: true,
      round
    });

  } catch (error) {
    console.error('Get round error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get round',
      message: error.message
    });
  }
});

// Get round leaderboard
router.post('/get-leaderboard', async (req, res) => {
  try {
    const { roundId, limit = 50 } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const leaderboard = await tradingRoundManager.getLeaderboard(roundId, parseInt(limit));
    
    res.json({
      success: true,
      roundId,
      leaderboard,
      count: leaderboard.length
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: error.message
    });
  }
});

// Get round participants with strategy info
router.post('/get-participants', async (req, res) => {
  try {
    const { roundId } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const participants = await tradingRoundManager.getRoundParticipants(roundId);
    
    res.json({
      success: true,
      roundId,
      participants,
      count: participants.length
    });

  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participants',
      message: error.message
    });
  }
});

// Get participant details
router.post('/get-participant', async (req, res) => {
  try {
    const { roundId, walletAddress } = req.body;
    
    if (!roundId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Round ID and wallet address are required'
      });
    }
    
    const participantData = await redisService.get(`round:${roundId}:participant:${walletAddress}`);
    if (!participantData) {
      return res.status(404).json({
        success: false,
        error: 'Participant not found'
      });
    }

    const participant = JSON.parse(participantData);
    
    res.json({
      success: true,
      participant
    });

  } catch (error) {
    console.error('Get participant error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participant',
      message: error.message
    });
  }
});

// Get participant trade logs
router.post('/get-participant-logs', async (req, res) => {
  try {
    const { roundId, walletAddress, limit = 100 } = req.body;
    
    if (!roundId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Round ID and wallet address are required'
      });
    }
    
    const logs = await tradingRoundManager.getParticipantLogs(roundId, walletAddress);
    
    res.json({
      success: true,
      logs: logs.slice(0, parseInt(limit)),
      count: logs.length
    });

  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

// List rounds by status
router.post('/list-rounds', async (req, res) => {
  try {
    const { status = 'active', limit = 20 } = req.body;
    
    const rounds = await tradingRoundManager.listRounds(status);
    
    // Add participant counts
    for (const round of rounds) {
      const participantAddresses = await redisService.sMembers(`round:${round.id}:participants`);
      round.currentParticipants = participantAddresses.length;
    }
    
    res.json({
      success: true,
      status,
      rounds: rounds.slice(0, parseInt(limit)),
      count: rounds.length
    });

  } catch (error) {
    console.error('List rounds error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list rounds',
      message: error.message
    });
  }
});

// Get all round statistics
router.post('/get-stats', async (req, res) => {
  try {
    const [activeRounds, runningRounds, finishedRounds] = await Promise.all([
      tradingRoundManager.listRounds('active'),
      tradingRoundManager.listRounds('running'),
      tradingRoundManager.listRounds('finished')
    ]);

    res.json({
      success: true,
      stats: {
        active: activeRounds.length,
        running: runningRounds.length,
        finished: finishedRounds.length,
        total: activeRounds.length + runningRounds.length + finishedRounds.length
      },
      rounds: {
        active: activeRounds.slice(0, 5),
        running: runningRounds.slice(0, 5),
        finished: finishedRounds.slice(0, 10)
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

// End a round manually (admin)
router.post('/end-round', async (req, res) => {
  try {
    const { roundId } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const round = await tradingRoundManager.endRound(roundId);
    
    res.json({
      success: true,
      round,
      message: 'Round ended successfully'
    });

  } catch (error) {
    console.error('End round error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to end round',
      message: error.message
    });
  }
});

// Check if wallet can join round
router.post('/can-join', async (req, res) => {
  try {
    const { roundId, walletAddress } = req.body;
    
    if (!roundId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Round ID and wallet address are required'
      });
    }
    
    const round = await tradingRoundManager.getRound(roundId);
    if (!round) {
      return res.json({
        success: false,
        canJoin: false,
        reason: 'Round not found'
      });
    }
    
    if (round.status !== 'waiting') {
      return res.json({
        success: false,
        canJoin: false,
        reason: `Round is ${round.status}`
      });
    }
    
    const participantKey = `round:${roundId}:participant:${walletAddress}`;
    const existingParticipant = await redisService.get(participantKey);
    if (existingParticipant) {
      return res.json({
        success: false,
        canJoin: false,
        reason: 'Wallet already joined this round'
      });
    }
    
    const participantAddresses = await redisService.sMembers(`round:${roundId}:participants`);
    if (participantAddresses.length >= round.maxParticipants) {
      return res.json({
        success: false,
        canJoin: false,
        reason: 'Round is full'
      });
    }
    
    res.json({
      success: true,
      canJoin: true,
      round: {
        id: round.id,
        title: round.title,
        currentParticipants: participantAddresses.length,
        maxParticipants: round.maxParticipants,
        status: round.status
      }
    });
    
  } catch (error) {
    console.error('Can join check error:', error);
    res.status(500).json({
      success: false,
      canJoin: false,
      error: 'Failed to check join eligibility'
    });
  }
});
// ========== ADD THESE TO YOUR EXISTING routes/game.js FILE ==========
// Add before the "module.exports = router;" line

// AI-Powered Game Creation
router.post('/create-game-from-prompt', async (req, res) => {
  try {
    const { 
      query, 
      maxParticipants = 10,
      minParticipants = 2,
      duration = 180,
      startingBalance = 10000,
      executionInterval = 15,
      autoStart = true,
      createdBy = 'ai-prompt'
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query prompt is required'
      });
    }

    console.log(`🤖 Processing AI game creation prompt: "${query}"`);
    
    // Parse the prompt with AI to extract game configuration
    const gameConfig = await parseGamePrompt(query);
    
    // Create the trading round with extracted configuration
    const roundConfig = {
      title: gameConfig.title || generateGameTitle(gameConfig),
      description: gameConfig.description || `AI-generated game: ${query.slice(0, 100)}...`,
      duration: (gameConfig.duration || duration) * 1000, // Convert to milliseconds
      startingBalance: gameConfig.startingBalance || startingBalance,
      maxParticipants,
      minParticipants,
      executionInterval: (gameConfig.executionInterval || executionInterval) * 1000,
      allowedTokens: gameConfig.tokens || ['ETH', 'TOSHI', 'DEGEN'],
      autoStart,
      createdBy,
      // Add AI-specific metadata
      aiGenerated: true,
      originalPrompt: query,
      aiConfig: gameConfig
    };

    const round = await tradingRoundManager.createRound(roundConfig);
    
    res.json({
      success: true,
      round,
      aiConfig: gameConfig,
      suggestedStrategy: gameConfig.strategy,
      extractedData: {
        tokens: gameConfig.tokens,
        targetProfit: gameConfig.targetProfit,
        riskLevel: gameConfig.riskLevel,
        gameType: gameConfig.gameType
      },
      message: 'AI-powered game created successfully'
    });

  } catch (error) {
    console.error('AI game creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create AI-powered game',
      message: error.message
    });
  }
});

// Get game templates
router.post('/get-game-templates', (req, res) => {
  const templates = [
    {
      id: 'trending-hunt',
      title: 'Trending Token Hunt',
      prompt: 'Create a 5-minute game to trade trending Base tokens with 10% profit target',
      description: 'Fast-paced trading of trending tokens',
      duration: 300,
      targetProfit: 10,
      riskLevel: 'high'
    },
    {
      id: 'stable-growth',
      title: 'Stable Growth Challenge',
      prompt: 'Create a 30-minute game focusing on ETH and major tokens with 5% profit target',
      description: 'Conservative trading with major tokens',
      duration: 1800,
      targetProfit: 5,
      riskLevel: 'low'
    },
    {
      id: 'defi-momentum',
      title: 'DeFi Momentum Play',
      prompt: 'Create a 15-minute game trading AERO, UNI, COMP with momentum strategy',
      description: 'DeFi token momentum trading',
      duration: 900,
      targetProfit: 7,
      riskLevel: 'medium'
    },
    {
      id: 'meme-madness',
      title: 'Meme Token Madness',
      prompt: 'Create a 10-minute game with TOSHI, DEGEN, BRETT for quick profits',
      description: 'High volatility meme token trading',
      duration: 600,
      targetProfit: 15,
      riskLevel: 'high'
    }
  ];

  res.json({
    success: true,
    templates,
    count: templates.length
  });
});

// Suggest strategy from prompt
router.post('/suggest-strategy-from-prompt', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const strategyPrompt = `
Based on this request, create a simple trading strategy:

Request: "${query}"

Create a strategy that matches the user's intent. Return just the strategy text (2-3 sentences max).
Focus on Base network tokens and clear rules.

Example: "Buy TOSHI when volume increases by 20%, sell when profit reaches 5% or loss hits 2%"
`;

    const strategy = await groqService.makeGroqRequest(async () => {
      const completion = await groqService.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a trading strategy advisor. Provide concise, actionable strategies.'
          },
          {
            role: 'user',
            content: strategyPrompt
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 200
      });

      return completion.choices[0]?.message?.content;
    });

    res.json({
      success: true,
      strategy: strategy.replace(/"/g, '').trim(),
      prompt: query
    });

  } catch (error) {
    console.error('Strategy suggestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest strategy',
      fallbackStrategy: "Buy trending tokens when volume increases, sell on 5-10% profit with 2% stop loss"
    });
  }
});

// ========== HELPER FUNCTIONS ==========
// Add these helper functions at the end, before module.exports

// AI Prompt Parser Function
async function parseGamePrompt(query) {
  // Import groq service at the top of file if not already imported
  const groqService = require('../services/groqService');
  
  const prompt = `
Parse this game creation request and extract configuration:

User Request: "${query}"

Return ONLY this JSON format:
{
  "title": "extracted game title",
  "description": "game description", 
  "tokens": ["token1", "token2"],
  "duration": 180,
  "startingBalance": 10000,
  "executionInterval": 15,
  "strategy": "suggested trading strategy",
  "gameType": "trending/momentum/arbitrage/prediction",
  "targetProfit": 5,
  "riskLevel": "low/medium/high",
  "timeframe": "5m/15m/1h",
  "focus": "specific focus area"
}

Extract values from the request. Use these defaults if not mentioned:
- duration: 180 seconds
- startingBalance: 10000  
- tokens: ["ETH", "TOSHI", "DEGEN"]
- targetProfit: 5
- riskLevel: "medium"
`;

  try {
    const response = await groqService.makeGroqRequest(async () => {
      const completion = await groqService.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a game configuration parser. Always respond with valid JSON only.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 800
      });

      return completion.choices[0]?.message?.content;
    });

    return groqService.cleanAndParseJSON(response);
  } catch (error) {
    console.error('Prompt parsing error:', error);
    // Return default config if AI fails
    return {
      title: "AI Trading Game",
      description: "Generated from user prompt",
      tokens: ["ETH", "TOSHI", "DEGEN"],
      duration: 180,
      startingBalance: 10000,
      strategy: "Buy trending tokens and sell on profit",
      gameType: "trending",
      targetProfit: 5,
      riskLevel: "medium"
    };
  }
}

// Generate game title from configuration
function generateGameTitle(config) {
  const templates = [
    `${config.gameType?.charAt(0).toUpperCase() + config.gameType?.slice(1) || 'Trading'} Challenge`,
    `${config.targetProfit || 5}% Profit Hunt`,
    `${config.riskLevel?.charAt(0).toUpperCase() + config.riskLevel?.slice(1) || 'Medium'} Risk Battle`,
    `${config.tokens?.[0] || 'Multi-Token'} Trading Arena`,
    `AI ${config.focus || 'Strategy'} Game`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}


module.exports = router;