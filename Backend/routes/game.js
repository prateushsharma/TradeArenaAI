// routes/game.js - All endpoints converted to POST
const express = require('express');
const router = express.Router();
const tradingRoundManager = require('../services/tradingRoundManager');
const redisService = require('../services/redisService');

// Create a new trading round
router.post('/create-round', async (req, res) => {
  try {
    const config = {
      title: req.body.title,
      description: req.body.description,
      duration: req.body.duration ? parseInt(req.body.duration) * 1000 : undefined, // Convert to ms
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

// Join a trading round
router.post('/join-round', async (req, res) => {
  try {
    const { roundId, walletAddress, strategy, username } = req.body;
    
    if (!roundId || !walletAddress || !strategy) {
      return res.status(400).json({
        success: false,
        error: 'Round ID, wallet address, and strategy are required'
      });
    }

    const participant = await tradingRoundManager.joinRound(roundId, {
      walletAddress,
      strategy,
      username
    });
    
    res.json({
      success: true,
      participant,
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

    // Get participant count
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

// Get all round statuses
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
        active: activeRounds.slice(0, 5), // Latest 5
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

// Get round participants list
router.post('/get-participants', async (req, res) => {
  try {
    const { roundId } = req.body;
    
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }
    
    const participantAddresses = await redisService.sMembers(`round:${roundId}:participants`);
    const participants = [];
    
    for (const address of participantAddresses) {
      const participantData = await redisService.get(`round:${roundId}:participant:${address}`);
      if (participantData) {
        const participant = JSON.parse(participantData);
        participants.push({
          walletAddress: participant.walletAddress,
          username: participant.username,
          joinedAt: participant.joinedAt,
          isActive: participant.isActive,
          totalValue: participant.portfolio.totalValue,
          pnlPercentage: participant.portfolio.pnlPercentage,
          trades: participant.portfolio.trades
        });
      }
    }
    
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
    
    // Check if round exists
    const round = await tradingRoundManager.getRound(roundId);
    if (!round) {
      return res.json({
        success: false,
        canJoin: false,
        reason: 'Round not found'
      });
    }
    
    // Check round status
    if (round.status !== 'waiting') {
      return res.json({
        success: false,
        canJoin: false,
        reason: `Round is ${round.status}`
      });
    }
    
    // Check if wallet already joined
    const participantKey = `round:${roundId}:participant:${walletAddress}`;
    const existingParticipant = await redisService.get(participantKey);
    if (existingParticipant) {
      return res.json({
        success: false,
        canJoin: false,
        reason: 'Wallet already joined this round'
      });
    }
    
    // Check if round is full
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