// routes/game.js - Updated with Strategy ID Management
const express = require('express');
const router = express.Router();
const tradingRoundManager = require('../services/tradingRoundManager');
const strategyManager = require('../services/strategyManager');
const redisService = require('../services/redisService');

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

module.exports = router;