// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title RoundRewards
 * @dev Handles trading round entry fees and reward distribution
 * Players pay 10 ARENA$ to join, winners get distributed rewards
 */
contract RoundRewards is Ownable, ReentrancyGuard {
    
    IERC20 public arenaToken;
    
    // Constants
    uint256 public constant ENTRY_FEE = 10 * 10**18;  // 10 ARENA$ to join round
    uint256 public constant ADMIN_FEE_PERCENT = 20;   // 20% goes to admin
    
    // Round structure
    struct Round {
        uint256 id;
        uint256 totalPool;
        uint256 participantCount;
        bool isActive;
        bool rewardsDistributed;
        mapping(address => bool) hasJoined;
        address[] participants;
    }
    
    // Mappings
    mapping(uint256 => Round) public rounds;
    mapping(address => uint256[]) public userRounds;
    
    // State variables
    uint256 public currentRoundId;
    uint256 public totalAdminEarnings;
    
    // Events
    event RoundCreated(uint256 indexed roundId);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint256 entryFee);
    event RoundEnded(uint256 indexed roundId, uint256 totalPool, uint256 participantCount);
    event RewardsDistributed(
        uint256 indexed roundId, 
        address[] winners, 
        uint256[] amounts,
        uint256 adminFee
    );
    event AdminFeeClaimed(address indexed admin, uint256 amount);
    
    constructor(address _arenaToken) Ownable(msg.sender) {
        arenaToken = IERC20(_arenaToken);
        currentRoundId = 1;
    }
    
    /**
     * @dev Create a new trading round
     */
    function createRound() external onlyOwner returns (uint256) {
        uint256 roundId = currentRoundId++;
        
        Round storage newRound = rounds[roundId];
        newRound.id = roundId;
        newRound.isActive = true;
        
        emit RoundCreated(roundId);
        return roundId;
    }
    
    /**
     * @dev Join a trading round by paying entry fee
     */
    function joinRound(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        
        require(round.isActive, "RoundRewards: Round not active");
        require(!round.hasJoined[msg.sender], "RoundRewards: Already joined this round");
        require(arenaToken.balanceOf(msg.sender) >= ENTRY_FEE, "RoundRewards: Insufficient balance");
        
        // Transfer entry fee to contract
        require(
            arenaToken.transferFrom(msg.sender, address(this), ENTRY_FEE),
            "RoundRewards: Transfer failed"
        );
        
        // Update round data
        round.hasJoined[msg.sender] = true;
        round.participants.push(msg.sender);
        round.totalPool += ENTRY_FEE;
        round.participantCount++;
        
        // Track user's rounds
        userRounds[msg.sender].push(roundId);
        
        emit PlayerJoined(roundId, msg.sender, ENTRY_FEE);
    }
    
    /**
     * @dev End round and distribute rewards to winners
     * @param roundId Round to end
     * @param winners Array of winner addresses (in rank order)
     * @param percentages Array of percentage shares (must sum to 100)
     */
    function distributeRewards(
        uint256 roundId,
        address[] calldata winners,
        uint256[] calldata percentages
    ) external onlyOwner nonReentrant {
        Round storage round = rounds[roundId];
        
        require(round.isActive, "RoundRewards: Round not active");
        require(!round.rewardsDistributed, "RoundRewards: Rewards already distributed");
        require(winners.length == percentages.length, "RoundRewards: Array length mismatch");
        require(winners.length > 0, "RoundRewards: No winners specified");
        
        // Validate percentages sum to 100
        uint256 totalPercentage = 0;
        for (uint256 i = 0; i < percentages.length; i++) {
            totalPercentage += percentages[i];
        }
        require(totalPercentage == 100, "RoundRewards: Percentages must sum to 100");
        
        uint256 totalPool = round.totalPool;
        
        // Calculate admin fee
        uint256 adminFee = (totalPool * ADMIN_FEE_PERCENT) / 100;
        totalAdminEarnings += adminFee;
        
        // Calculate prize pool after admin fee
        uint256 prizePool = totalPool - adminFee;
        
        // Distribute rewards to winners
        uint256[] memory rewardAmounts = new uint256[](winners.length);
        
        for (uint256 i = 0; i < winners.length; i++) {
            require(round.hasJoined[winners[i]], "RoundRewards: Winner not in round");
            
            uint256 rewardAmount = (prizePool * percentages[i]) / 100;
            rewardAmounts[i] = rewardAmount;
            
            require(
                arenaToken.transfer(winners[i], rewardAmount),
                "RoundRewards: Reward transfer failed"
            );
        }
        
        // Update round status
        round.isActive = false;
        round.rewardsDistributed = true;
        
        emit RoundEnded(roundId, totalPool, round.participantCount);
        emit RewardsDistributed(roundId, winners, rewardAmounts, adminFee);
    }
    
    /**
     * @dev Claim accumulated admin fees
     */
    function claimAdminFees() external onlyOwner nonReentrant {
        require(totalAdminEarnings > 0, "RoundRewards: No fees to claim");
        
        uint256 amount = totalAdminEarnings;
        totalAdminEarnings = 0;
        
        require(
            arenaToken.transfer(owner(), amount),
            "RoundRewards: Admin fee transfer failed"
        );
        
        emit AdminFeeClaimed(owner(), amount);
    }
    
    /**
     * @dev Get round information
     */
    function getRoundInfo(uint256 roundId) external view returns (
        uint256 id,
        uint256 totalPool,
        uint256 participantCount,
        bool isActive,
        bool rewardsDistributed,
        address[] memory participants
    ) {
        Round storage round = rounds[roundId];
        return (
            round.id,
            round.totalPool,
            round.participantCount,
            round.isActive,
            round.rewardsDistributed,
            round.participants
        );
    }
    
    /**
     * @dev Check if user has joined a specific round
     */
    function hasUserJoinedRound(uint256 roundId, address user) external view returns (bool) {
        return rounds[roundId].hasJoined[user];
    }
    
    /**
     * @dev Get user's round history
     */
    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }
    
    /**
     * @dev Get current round ID
     */
    function getCurrentRoundId() external view returns (uint256) {
        return currentRoundId - 1; // Last created round
    }
    
    /**
     * @dev Emergency function to end round without rewards (admin only)
     * Returns entry fees to participants
     */
    function emergencyEndRound(uint256 roundId) external onlyOwner nonReentrant {
        Round storage round = rounds[roundId];
        
        require(round.isActive, "RoundRewards: Round not active");
        require(!round.rewardsDistributed, "RoundRewards: Rewards already distributed");
        
        // Return entry fees to all participants
        for (uint256 i = 0; i < round.participants.length; i++) {
            address participant = round.participants[i];
            require(
                arenaToken.transfer(participant, ENTRY_FEE),
                "RoundRewards: Emergency refund failed"
            );
        }
        
        round.isActive = false;
        round.totalPool = 0;
        
        emit RoundEnded(roundId, 0, round.participantCount);
    }
}