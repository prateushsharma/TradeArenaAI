//SPDX-License-Identifier: MIT

pragma solidity^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ArenaToken
 * @dev ERC20 token for the Trading Arena game
 * Users can mint 100 ARENA$ tokens once per address
 */

 contract ArenaToken is ERC20, Ownable, ReentrancyGuard {

    // contants
    uint256 public constant MINT_AMOUNT = 100 * 10**18;
    uint256 public constant MAX_SUPPLY = 10000000 * 10**18;

    //Mappings
    mapping(address => bool) public hasMinted;
    mapping(address => bool) public authorizedContracts;

    // Events
    event TokensMinted(address indexed user, uint256 amount);
    event ContractAuthorized(address indexed contractAddr, bool authotized);

    constructor() ERC20("Arena Token", "ARENA") Ownable(msg.sender){}

    // Minint 100 Arena tokens to the caller(once per address)

    function mint() external nonReentrant {
        require(!hasMinted[msg.sender],"ArenaToken: Already minted");
        require(totalSupply()+MINT_AMOUNT <= MAX_SUPPLY,"ArenaToken: Max supply exceeded");

        hasMinted[msg.sender] = true;
        _mint(msg.sender,MINT_AMOUNT);

        emit TokensMinted(msg.sender,MINT_AMOUNT);
    }

    // check if address has alreday minted
    function hasAlreadyMinted(address user) external view returns(bool) {
        return hasMinted[user];
    }

    function getUserBalance(address user) external view returns( uint256 ) {
        return balanceOf(user);
    }

    /**
     * @dev Authorize contract to manage tokens (for game contracts)
     * Only owner can authorize contracts
     */
     function authorizeContract(address contractAddr, bool authorized) external onlyOwner {
        authorizedContracts[contractAddr] = authorized;
        emit ContractAuthorized(contractAddr, authorized);
     }

     // check if contract is authorized

     function isAuthorizedContract(address contractAddr) external view returns (bool){
        return authorizedContracts[contractAddr];
     }

     function mintTo(address to, uint256 amount) external {
        require(authorizedContracts[msg.sender],"ARenaToken: Not authorized");
        require(totalSupply() + amount <= MAX_SUPPLY,"Arena: Max supply exceeded");

        _mint(to,amount);
        emit TokensMinted(to,amount);
     }

     /**
     * @dev Burn tokens from address (only authorized contracts)
     * Used for penalties or token burns
     */
    function burnFrom(address from, uint256 amount) external {
        require(authorizedContracts[msg.sender], "ArenaToken: Not authorized");
        require(balanceOf(from) >= amount, "ArenaToken: Insufficient balance");
        
        _burn(from, amount);
    }
         function getTokenInfo() external view returns (
        string memory tokenName,
        string memory tokenSymbol,
        uint256 currentSupply,
        uint256 maxSupply,
        uint8 tokenDecimals
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            MAX_SUPPLY,
            decimals()
        );
    }
 }

