// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title StrategyLicense
 * @dev Handles strategy licensing and revenue sharing
 * Users can license winning strategies and share profits with strategy creators
 */
contract StrategyLicense is Ownable, ReentrancyGuard {
    
    IERC20 public arenaToken;
    
    // Constants
    uint256 public constant PLATFORM_FEE_PERCENT = 5;  // 5% platform fee
    uint256 public constant MIN_ROYALTY = 5;           // Min 5% royalty
    uint256 public constant MAX_ROYALTY = 50;          // Max 50% royalty
    
    // Strategy structure - OPTIMIZED (no strings stored)
    struct Strategy {
        address owner;
        uint256 royaltyPercent;    // Percentage the owner gets from profits (5-50%)
        uint256 totalEarnings;     // Total earned by this strategy
        uint32 timesUsed;          // How many times strategy was licensed
        uint16 winRate;            // Win rate percentage (0-10000 for 2 decimals)
        bool isActive;             // Can be licensed or not
        bool isVerified;           // Verified by admin
    }
    
    // License structure - OPTIMIZED
    struct License {
        uint32 strategyId;
        address licensee;
        uint32 roundId;
        uint256 profitShared;      // Total profit shared so far
        bool isActive;
    }
    
    // Mappings - OPTIMIZED
    mapping(uint32 => Strategy) public strategies;
    mapping(address => uint32[]) public userStrategies;
    mapping(uint32 => License) public licenses;
    mapping(address => mapping(uint32 => uint32)) public userRoundLicense; // user -> roundId -> licenseId
    
    // State variables - OPTIMIZED
    uint32 public nextStrategyId = 1;
    uint32 public nextLicenseId = 1;
    uint256 public totalPlatformEarnings;
    
    // Events - OPTIMIZED
    event StrategyRegistered(uint32 indexed strategyId, address indexed owner, uint256 royaltyPercent);
    event StrategyLicensed(uint32 indexed licenseId, uint32 indexed strategyId, address indexed licensee, uint32 roundId);
    event ProfitShared(
        uint32 indexed licenseId,
        uint32 indexed strategyId,
        address indexed strategyOwner,
        address licensee,
        uint256 profit,
        uint256 ownerShare,
        uint256 platformFee,
        uint256 licenseeShare
    );
    event StrategyStatusChanged(uint32 indexed strategyId, bool isActive);
    event StrategyVerified(uint32 indexed strategyId, bool isVerified);
    
    constructor(address _arenaToken) Ownable(msg.sender) {
        arenaToken = IERC20(_arenaToken);
    }
    
    /**
     * @dev Register a new strategy for licensing - OPTIMIZED
     * @param royaltyPercent Percentage of profits to share (5-50%)
     * @return strategyId The ID of the registered strategy
     */
    function registerStrategy(uint256 royaltyPercent) external returns (uint32) {
        require(royaltyPercent >= MIN_ROYALTY && royaltyPercent <= MAX_ROYALTY, 
                "StrategyLicense: Invalid royalty percentage");
        
        uint32 strategyId = nextStrategyId++;
        
        strategies[strategyId] = Strategy({
            owner: msg.sender,
            royaltyPercent: royaltyPercent,
            totalEarnings: 0,
            timesUsed: 0,
            winRate: 0,
            isActive: true,
            isVerified: false
        });
        
        userStrategies[msg.sender].push(strategyId);
        
        emit StrategyRegistered(strategyId, msg.sender, royaltyPercent);
        return strategyId;
    }
    
    /**
     * @dev License a strategy for a specific round - OPTIMIZED
     * @param strategyId Strategy to license
     * @param roundId Round to use strategy in
     */
    function licenseStrategy(uint32 strategyId, uint32 roundId) external nonReentrant returns (uint32) {
        Strategy storage strategy = strategies[strategyId];
        
        require(strategy.owner != address(0), "StrategyLicense: Strategy does not exist");
        require(strategy.isActive, "StrategyLicense: Strategy not active");
        require(strategy.owner != msg.sender, "StrategyLicense: Cannot license own strategy");
        require(userRoundLicense[msg.sender][roundId] == 0, "StrategyLicense: Already licensed for this round");
        
        uint32 licenseId = nextLicenseId++;
        
        licenses[licenseId] = License({
            strategyId: strategyId,
            licensee: msg.sender,
            roundId: roundId,
            profitShared: 0,
            isActive: true
        });
        
        userRoundLicense[msg.sender][roundId] = licenseId;
        strategy.timesUsed++;
        
        emit StrategyLicensed(licenseId, strategyId, msg.sender, roundId);
        return licenseId;
    }
    
    /**
     * @dev Share profits from a round where strategy was used - OPTIMIZED
     * @param licenseId License ID
     * @param totalProfit Total profit made by the licensee
     */
    function shareProfit(uint32 licenseId, uint256 totalProfit) external nonReentrant {
        License storage license = licenses[licenseId];
        Strategy storage strategy = strategies[license.strategyId];
        
        require(license.licensee != address(0), "StrategyLicense: License does not exist");
        require(license.isActive, "StrategyLicense: License not active");
        require(totalProfit > 0, "StrategyLicense: No profit to share");
        
        // Only contract owner can share profits (from backend)
        require(msg.sender == owner(), "StrategyLicense: Not authorized");
        
        // Calculate shares
        uint256 ownerShare = (totalProfit * strategy.royaltyPercent) / 100;
        uint256 platformFee = (totalProfit * PLATFORM_FEE_PERCENT) / 100;
        uint256 licenseeShare = totalProfit - ownerShare - platformFee;
        
        // Transfer tokens to recipients
        require(
            arenaToken.transfer(strategy.owner, ownerShare),
            "StrategyLicense: Owner share transfer failed"
        );
        require(
            arenaToken.transfer(license.licensee, licenseeShare),
            "StrategyLicense: Licensee share transfer failed"
        );
        // Platform fee stays in contract
        
        // Update tracking
        license.profitShared += totalProfit;
        strategy.totalEarnings += ownerShare;
        totalPlatformEarnings += platformFee;
        
        emit ProfitShared(
            licenseId,
            license.strategyId,
            strategy.owner,
            license.licensee,
            totalProfit,
            ownerShare,
            platformFee,
            licenseeShare
        );
    }
    
    /**
     * @dev Update strategy status (active/inactive) - OPTIMIZED
     */
    function setStrategyStatus(uint32 strategyId, bool isActive) external {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.owner == msg.sender, "StrategyLicense: Not strategy owner");
        
        strategy.isActive = isActive;
        emit StrategyStatusChanged(strategyId, isActive);
    }
    
    /**
     * @dev Verify strategy (admin only) - OPTIMIZED
     */
    function verifyStrategy(uint32 strategyId, bool isVerified) external onlyOwner {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.owner != address(0), "StrategyLicense: Strategy does not exist");
        
        strategy.isVerified = isVerified;
        emit StrategyVerified(strategyId, isVerified);
    }
    
    /**
     * @dev Update strategy win rate (admin only) - OPTIMIZED
     */
    function updateWinRate(uint32 strategyId, uint16 winRate) external onlyOwner {
        require(winRate <= 10000, "StrategyLicense: Invalid win rate"); // 10000 = 100.00%
        
        Strategy storage strategy = strategies[strategyId];
        require(strategy.owner != address(0), "StrategyLicense: Strategy does not exist");
        
        strategy.winRate = winRate;
    }
    
    /**
     * @dev Claim platform earnings
     */
    function claimPlatformEarnings() external onlyOwner nonReentrant {
        require(totalPlatformEarnings > 0, "StrategyLicense: No earnings to claim");
        
        uint256 amount = totalPlatformEarnings;
        totalPlatformEarnings = 0;
        
        require(
            arenaToken.transfer(owner(), amount),
            "StrategyLicense: Platform earnings transfer failed"
        );
    }
    
    /**
     * @dev Get strategy information - OPTIMIZED
     */
    function getStrategy(uint32 strategyId) external view returns (
        address owner,
        uint256 royaltyPercent,
        uint256 totalEarnings,
        uint32 timesUsed,
        uint16 winRate,
        bool isActive,
        bool isVerified
    ) {
        Strategy storage strategy = strategies[strategyId];
        return (
            strategy.owner,
            strategy.royaltyPercent,
            strategy.totalEarnings,
            strategy.timesUsed,
            strategy.winRate,
            strategy.isActive,
            strategy.isVerified
        );
    }
    
    /**
     * @dev Get license information - OPTIMIZED
     */
    function getLicense(uint32 licenseId) external view returns (
        uint32 strategyId,
        address licensee,
        uint32 roundId,
        uint256 profitShared,
        bool isActive
    ) {
        License storage license = licenses[licenseId];
        return (
            license.strategyId,
            license.licensee,
            license.roundId,
            license.profitShared,
            license.isActive
        );
    }
    
    /**
     * @dev Get user's strategies - OPTIMIZED
     */
    function getUserStrategies(address user) external view returns (uint32[] memory) {
        return userStrategies[user];
    }
    
    /**
     * @dev Get user's license for a specific round - OPTIMIZED
     */
    function getUserRoundLicense(address user, uint32 roundId) external view returns (uint32) {
        return userRoundLicense[user][roundId];
    }
}