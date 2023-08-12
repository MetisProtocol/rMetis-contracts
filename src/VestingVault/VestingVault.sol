// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

 
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../ERC20/RMetis.sol";

/**
 * @title VestingVault
 * @dev A contract for managing the vesting of RMetis tokens, including claim and redeem functionalities.
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract VestingVault is Ownable, ReentrancyGuard {
    
    using SafeMath for uint256;

    // Redemption token parameters
    RMetis public rMetis; // RMetis token
    bytes32 public merkleRoot; // merkle root of the merkle tree for the airdrop
	uint256 public claimDeadline; // deadline for claiming the redemption tokens
	mapping (address => bool) public claimed; // has this address claimed their rMetis tokens?
    
    // Vesting parameters
    uint256 public startDate; // start date of the vesting period
    uint256 public endDate; // end date of the vesting period
    uint256 public minPrice; // value of 1 RMetis in Metis at the start of the vesting period * 10000
    uint256 public maxPrice; // value of 1 RMetis in Metis at or after the end of the vesting period * 10000

    uint256 public currentSlashed; // amount of slashed tokens, resets everytime redeemSlashed is called
    uint256 public totalSlashed; // total amount of slashed tokens, added for analytical purposes

    uint256 public constant PRICE_PRECISION = 10000; // precision for the price ratio

    /// @notice Event emitted when a claim is successful
	event Claimed(address indexed account, uint256 amount);

    /// @notice Event emitted when the owner claims remaining tokens
	event ClaimedOwner(address indexed account, uint256 amount);

    /// @notice Event emitted when rMetis tokens are redeemed for Metis tokens
    event Redeemed(address indexed account, uint256 rMetisAmount, uint256 ratio);

    /// @notice Event emitted when the owner redeems slashed tokens
    event RedeemedSlashed(address indexed account, uint256 amount, uint256 totalSlashed);
	
    /**
     * @notice Initialize the contract and deposit the funds
     * @notice The funds will be used to redeem rMetis tokens for Metis
     * @param _merkleRoot Merkle root of the merkle tree for the airdrop
     * @param _airdropDurationDays Duration of the airdrop in days
     * @param _startDate Start date of the vesting period
     * @param _endDate End date of the vesting period
     * @param _minPrice Value of 1 RMetis in Metis at the start of the vesting period * PRICE_PRECISION
     * @param _maxPrice Value of 1 RMetis in Metis at or after the end of the vesting period * PRICE_PRECISION
     * @dev The msg.value should exactly match the sum in the merkle tree
     */
	constructor(bytes32 _merkleRoot, uint256 _airdropDurationDays, uint256 _startDate, uint256 _endDate, uint256 _minPrice, uint256 _maxPrice) payable {
		rMetis = new RMetis(msg.value); // create the redemption token, mints the msg.value to `this`
        merkleRoot = _merkleRoot;
        claimDeadline = block.timestamp + _airdropDurationDays;

        startDate = _startDate;
        endDate = _endDate;
        minPrice = _minPrice;
        maxPrice = _maxPrice;
	}

    /**
     * @notice Claim rMetis tokens from the airdrop
     * @param amount Amount of rMetis tokens to claim
     * @param index Index of the address in the merkle tree
     * @param merkleProof Merkle proof of the address
     */
	function claim(
		uint256 amount,
		uint256 index,
		bytes32[] calldata merkleProof
	) external {
		// Verify the merkle proof.
		bytes32 node = keccak256(abi.encodePacked(index, msg.sender, amount));

		require(block.timestamp < claimDeadline, "VestingVault: Claim deadline has passed.");
		require(MerkleProof.verify(merkleProof, merkleRoot, node), "VestingVault: Invalid proof.");
        require(!claimed[msg.sender], "VestingVault: Drop already claimed.");

		// Mark it claimed and send the token.
		claimed[msg.sender] = true;
        rMetis.transfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
	}

    /**
     * @notice Claim the remaining rMetis tokens after the vesting period is over
     * @dev This function can be only called by the owner after the claiming period is over to recover the unclaimable rMetis tokens
     */
	function claimOwner() external onlyOwner {
		require(block.timestamp >= claimDeadline, "VestingVault: Claim deadline has not passed.");
        
        uint256 amount = rMetis.balanceOf(address(this));
        rMetis.transfer(msg.sender, amount);

        emit ClaimedOwner(msg.sender, amount);
	}

    /**
     * @notice Calculate the current price ratio
     * @return Current price ratio
     */
    function priceRatio() public view returns (uint256) {
        if (block.timestamp < startDate) {
            return 0;
        } else {
            uint256 timePassed = block.timestamp - startDate;
            uint256 timeTotal = endDate - startDate;
            uint256 priceDiff = maxPrice - minPrice;
            return Math.min(minPrice + priceDiff.mul(timePassed).div(timeTotal), maxPrice);
        }
    }

    /**
     * @notice Redeem rMetis tokens for Metis according to the price ratio at the time
     * @param sender Address of the rMetis token holder
     * @param amount Amount of rMetis tokens to redeem
     */
    function _redeem(address sender, uint256 amount, uint256 ratio) internal {
        uint256 metisAmount = amount.mul(ratio).div(PRICE_PRECISION);

        rMetis.transferFrom(sender, address(this), amount);
        rMetis.burn(amount);
        payable(sender).transfer(metisAmount);

        currentSlashed = currentSlashed.add(metisAmount.sub(amount));
        totalSlashed = totalSlashed.add(metisAmount.sub(amount));
    }

    /**
     * @notice Redeem rMetis tokens for Metis according to the price ratio at the time
     * @notice The owner of this contract can redeem rMetis tokens for Metis always at a price ration of 1 to 1
     * @param amount Amount of rMetis tokens to redeem
     */
    function redeem(uint256 amount) external nonReentrant {
        require(block.timestamp >= startDate, "VestingVault: Vesting period has not started.");
        require(amount > 0, "VestingVault: Amount must be greater than 0.");
        require(rMetis.balanceOf(msg.sender) >= amount, "VestingVault: Insufficient rMetis balance.");

        uint256 ratio = msg.sender == owner() ? PRICE_PRECISION : priceRatio(); // The owner of this contract can redeem rMetis tokens for Metis always at a price ration of 1 to 1 
        _redeem(msg.sender, amount, ratio);

        emit Redeemed(msg.sender, amount, ratio);
    }

    /**
     * @notice Redeem slashed Metis tokens
     * @dev This function can be only called by the owner to recover the slashed Metis tokens
     */
    function redeemSlashed() external onlyOwner nonReentrant {
        uint256 amount = currentSlashed;
        currentSlashed = 0;
        payable(msg.sender).transfer(amount);

        emit RedeemedSlashed(msg.sender, amount, totalSlashed);
    }

}
