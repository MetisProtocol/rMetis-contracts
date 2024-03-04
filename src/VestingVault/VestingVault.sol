// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";


/**
 * @title VestingVault
 * @dev A contract for managing the claiming of allocated metis token and vesting of RMetis tokens, including claim and redeem functionalities.
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract VestingVault is Ownable2Step, Pausable, Initializable {
	using SafeMath for uint256;

	struct RedeemInfo {
		uint256 redeemAmount; // Metis amount to receive when vesting has ended
		uint256 redeemEnd;
		uint256 claimAmount;
  	}

	// Redemption token parameters
	address public constant METIS_TOKEN = 0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000;
	ERC1155PresetMinterPauser public rMetis; // redeemed Metis token
	bytes32 public merkleRoot; // merkle root of the merkle tree for the airdrop
	uint256 public claimDeadline; // deadline for claiming the redemption tokens
	mapping(address => uint256) public claimed; // the amount of rMetis tokens this leaf has claimed

	// User redeems info
	mapping(uint256 => RedeemInfo) redeems; // redeemId to redeem info
	uint256 public redeemsCnt = 0;

	// Vesting parameters
	uint256 public minPrice; // value of 1 RMetis in Metis at the start of the vesting period * 10000
	uint256 public maxPrice; // value of 1 RMetis in Metis at or after the end of the vesting period * 10000
	uint256 public cliffLength; // The vesting cliff
	uint256 public maxRedeemLength; // The maximum possible period of vesting

	uint256 public currentSlashed; // amount of slashed tokens, resets everytime redeemSlashed is called
	uint256 public totalSlashed; // total amount of slashed tokens, added for analytical purposes

	uint256 public constant PRICE_PRECISION = 10000; // precision for the price ratio	

	/// @notice Event emitted when a claim is successful
	event Claimed(address indexed account, uint256 indexed redeemId, uint256 amountRedeemed, uint256 redeemEnd, uint256 claimAmount);

	/// @notice Event emitted when a claim is reversed
	event UnClaimed(uint256 indexed redeemId);

	/// @notice Event emitted when the owner claims remaining tokens
	event ClaimedOwner(address indexed account, uint256 amount);

	/// @notice Event emitted when rMetis tokens are redeemed for Metis tokens
	event Redeemed(address indexed account, uint256 indexed redeemId, uint256 redeemAmount);

	/// @notice Event emitted when the owner redeems slashed tokens
	event RedeemedSlashed(address indexed account, uint256 amount, uint256 totalSlashed);

	/**
	 * @notice Initialize the contract
	 * @param merkleRoot_ Merkle root of the merkle tree for the airdrop
	 * @param claimDeadline_ Deadline for claiming rMetis airdrop
	 * @param minPrice_ Value of 1 RMetis in Metis at the start of the vesting period * PRICE_PRECISION
	 * @param maxPrice_ Value of 1 RMetis in Metis at or after the end of the vesting period * PRICE_PRECISION
	 * @param cliffLength_ The vesting cliff
	 * @param maxRedeemLength_; // The maximum possible period of vesting
	 */
	function initialize(
		bytes32 merkleRoot_,
		uint256 claimDeadline_,
		uint256 minPrice_,
		uint256 maxPrice_,
		uint256 cliffLength_,
		uint256 maxRedeemLength_
	) public initializer {
		require(claimDeadline_ > block.timestamp, "VestingVault: Invalid airdrop duration.");
		require(minPrice_ <= maxPrice_ && maxPrice_ <= PRICE_PRECISION, "VestingVault: Invalid price range.");
		require(cliffLength_ < maxRedeemLength_, "VestingVault: Invalid redeem length bounds");

		rMetis = new ERC1155PresetMinterPauser(""); // create the redemption token
		merkleRoot = merkleRoot_;
		claimDeadline = claimDeadline_;

		minPrice = minPrice_;
		maxPrice = maxPrice_;
		cliffLength = cliffLength_;
		maxRedeemLength = maxRedeemLength_;
	}
 
	receive() external payable {}

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
	function emergencyRecoverToken(address token, uint256 amount) external onlyOwner {
		IERC20(token).transfer(_msgSender(), amount);
	}

	/**
	 * @notice Claim rMetis tokens from the airdrop
	 * @param amount Amount of metis tokens allocated
	 * @param merkleProof Merkle proof array for the msg.sender address
	 * @param claimAmount Amount of allocated metis tokens to start redeeming
	 * @param redeemEnd The end timestamp for the redeem
	 */
	function claim(uint256 amount, bytes32[] calldata merkleProof, uint256 claimAmount, uint256 redeemEnd) external whenNotPaused {
		// Verify the merkle proof.
		// hash twice because @openzeppelin/merkle-tree hashes the leaf twice, use abi.encode for same reason;
		bytes32 node = keccak256(abi.encodePacked(keccak256(abi.encode(_msgSender(), amount))));

		// Check time requiremets
		require(block.timestamp < claimDeadline, "VestingVault: Claim deadline has passed.");
		require(redeemEnd.sub(block.timestamp) >= cliffLength, "VestingVault: Redeem shorter than cliffLength");
		require(redeemEnd.sub(block.timestamp) <= maxRedeemLength, "VestingVault: Redeem longer than maxRedeemLength");
		// Check merkle proof validity
		require(MerkleProof.verify(merkleProof, merkleRoot, node), "VestingVault: Invalid proof.");
		// Check amount requirements
		require(claimed[_msgSender()].add(claimAmount) <= amount, "VestingVault: Drop already claimed.");
		require(claimAmount > 0, "Claim Amount can't be zero");


		// Mark it claimed
		claimed[_msgSender()] += claimAmount;		
		uint256 redeemAmount = priceRatioAt(redeemEnd, block.timestamp).mul(claimAmount).div(PRICE_PRECISION);
		
		redeems[++redeemsCnt] = RedeemInfo({
			redeemAmount: redeemAmount,
			redeemEnd: redeemEnd,
			claimAmount: claimAmount
		});

		rMetis.mint(_msgSender(), redeemsCnt, redeemAmount, "");
		emit Claimed(_msgSender(), redeemsCnt, redeemAmount, redeemEnd, claimAmount);
	}

 	/**
	 * @notice Calculate the price ratio at `timestamp`
	 * @param timestamp The end date of the vesting
	 * @param startDate the start date of the vesting
	 * @return price ratio
	 */
	function priceRatioAt(uint256 timestamp, uint256 startDate) public view returns (uint256) {
		if (timestamp < startDate) {
			return 0;
		} else {
			uint256 timePassed = timestamp - startDate;
			uint256 timeTotal = maxRedeemLength;
			uint256 priceDiff = maxPrice - minPrice;
			return Math.min(minPrice + priceDiff.mul(timePassed).div(timeTotal), maxPrice);
		}	
	}

	/**
	 * @notice Redeem metis tokens after the vesting period ends
	 * @param redeemId The id of the redemption
	 * @param amount The amount to redeem
	 * @dev this contract must be approved by user `msg.sender` to spend all
	 */
	function redeem(uint256 redeemId, uint256 amount) public {
		require(redeems[redeemId].redeemEnd >= block.timestamp, "VestingVault: wait for the end of redemption");
		rMetis.burn(_msgSender(), redeemId, amount);
		IERC20(METIS_TOKEN).transfer(_msgSender(), amount);
	}

	function resetRedeemDate(uint256 redeemId, uint256 newRedeemEnd) public {
		rMetis.burn(_msgSender(), redeemId, redeems[redeemId].claimAmount);

		require(redeems[redeemId].redeemEnd < block.timestamp, "VestingVault: Can't unclaim after redeem period is over");
		require(block.timestamp < claimDeadline, "VestingVault: Claim deadline has passed.");
		require(newRedeemEnd.sub(block.timestamp) >= cliffLength, "VestingVault: Redeem shorter than cliffLength");
		require(newRedeemEnd.sub(block.timestamp) <= maxRedeemLength, "VestingVault: Redeem longer than maxRedeemLength");	

		uint256 newRedeemAmount = priceRatioAt(newRedeemEnd, block.timestamp).mul(redeems[redeemId].claimAmount).div(PRICE_PRECISION);
		
		redeems[++redeemsCnt] = RedeemInfo({
			redeemAmount: newRedeemAmount,
			redeemEnd: newRedeemEnd,
			claimAmount: redeems[redeemId].claimAmount
		});

		rMetis.mint(_msgSender(), redeemsCnt, newRedeemAmount, "");
		emit Claimed(_msgSender(), redeemsCnt, newRedeemAmount, newRedeemEnd, redeems[redeemId].claimAmount);

		
		delete redeems[redeemId];
		emit UnClaimed(redeemId);
	}
}
