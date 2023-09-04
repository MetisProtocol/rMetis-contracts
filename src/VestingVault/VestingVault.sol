// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/access/Ownable.sol"
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

import "../ERC20/RMetis.sol";

/**
 * @title VestingVault
 * @dev A contract for managing the vesting of RMetis tokens, including claim and redeem functionalities.
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract VestingVault is Ownable2Step, ReentrancyGuard, Pausable {
	using SafeMath for uint256;

	// Redemption token parameters
	RMetis public rMetis; // RMetis token
	bytes32 public immutable merkleRoot; // merkle root of the merkle tree for the airdrop
	uint256 public immutable claimDeadline; // deadline for claiming the redemption tokens
	mapping(address => bool) public claimed; // has this address claimed their rMetis tokens?

	// Vesting parameters
	uint256 public immutable startDate; // start date of the vesting period
	uint256 public immutable endDate; // end date of the vesting period
	uint256 public immutable minPrice; // value of 1 RMetis in Metis at the start of the vesting period * 10000
	uint256 public immutable maxPrice; // value of 1 RMetis in Metis at or after the end of the vesting period * 10000

	uint256 public currentSlashed; // amount of slashed tokens, resets everytime redeemSlashed is called
	uint256 public totalSlashed; // total amount of slashed tokens, added for analytical purposes

	uint256 public constant PRICE_PRECISION = 10000; // precision for the price ratio
	uint256 public constant DAY_SECONDS = 24 * 60 * 60;

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
	constructor(
		bytes32 _merkleRoot,
		uint256 _airdropDurationDays,
		uint256 _startDate,
		uint256 _endDate,
		uint256 _minPrice,
		uint256 _maxPrice
	) {
		rMetis = new RMetis(); // create the redemption token, mints and equal amount to the msg.value to `this`
		merkleRoot = _merkleRoot;
		claimDeadline = block.timestamp + _airdropDurationDays * DAY_SECONDS;
		require(claimDeadline > block.timestamp, "VestingVault: Invalid airdrop duration.");

		require(_startDate < _endDate, "VestingVault: Invalid vesting period.");
		startDate = _startDate;
		endDate = _endDate;

		require(_minPrice <= _maxPrice && _maxPrice <= PRICE_PRECISION, "VestingVault: Invalid price range.");
		minPrice = _minPrice;
		maxPrice = _maxPrice;
	}

	/**
	 * @notice Desposit the funds, mint the rMetis tokens to `this`
	 * @dev The msg.value should exactly match the sum in the merkle tree
	 */
	function deposit() external payable onlyOwner {
		require(msg.value > 0, "Deposit should be non-zero");
		rMetis.mint(msg.value); // Mint an equal amount of msg.value to `this`
	}

	/**
	 * @notice Pause the contract
	 * @dev This function can be only called by the owner
	 */
	function pause() external onlyOwner {
		_pause();
	}

	/**
	 * @notice Unpause the contract
	 * @dev This function can be only called by the owner
	 */
	function unPause() external onlyOwner {
		_unpause();
	}

	/**
	 * @notice Recovers the funds sent to the contract in case of an emergency
	 * @dev This function can be only called by the owner
	 */
	function emergencyRecoverToken(address _token, uint256 _amount) external onlyOwner {
		IERC20(_token).transfer(msg.sender, _amount);
	}

	/**
	 * @notice Claim rMetis tokens from the airdrop
	 * @param amount Amount of rMetis tokens to claim
	 * @param merkleProof Merkle proof of the address
	 */
	function claim(uint256 amount, bytes32[] calldata merkleProof) external whenNotPaused {
		// Verify the merkle proof.
		// hash twice because @openzeppelin/merkle-tree hashes the leaf twice, use abi.encode for same reason;
		bytes32 node = keccak256(abi.encodePacked(keccak256(abi.encode(msg.sender, amount))));

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

		currentSlashed = currentSlashed.add(amount.sub(metisAmount));
		totalSlashed = totalSlashed.add(amount.sub(metisAmount));
	}

	/**
	 * @notice Redeem rMetis tokens for Metis according to the price ratio at the time
	 * @notice The owner of this contract can redeem rMetis tokens for Metis always at a price ration of 1 to 1
	 * @param amount Amount of rMetis tokens to redeem
	 */
	function redeem(uint256 amount) external nonReentrant whenNotPaused {
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
