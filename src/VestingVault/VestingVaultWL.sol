// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './VestingVault.sol';

/**
 * @title VestingVaultWL
 * @dev A contract for managing the vesting of RMetis tokens, including claim and redeem functionalities.
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract VestingVaultWL is VestingVault {
	mapping(address => uint256) public whitelist; // This whitelist is for additions added by the owner

	/**
	 * @notice Initialize the contract
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
	) VestingVault(
		_merkleRoot,
		_airdropDurationDays,
		_startDate,
		_endDate,
		_minPrice,
		_maxPrice
	) {}

	/**
	 * @notice Add a list of users to the whitelist
	 * @param users The list of users
	 * @param amounts The amount for each user
	 */
	function addWhitelist(address[] memory users, uint256[] memory amounts) external onlyOwner {
		require(users.length == amounts.length, "VestingVaultWL: Lengths no match");
		for(uint i=0; i<users.length; i++) {
			whitelist[users[i]] = amounts[i];
		}
	}

	/**
	 * @notice Claim rMetis tokens for users who were added to the whitelist by admin
	 */
	function claimWhitelist() external whenNotPaused {
		require(block.timestamp < claimDeadline, "VestingVault: Claim deadline has passed.");
		require(whitelist[msg.sender] > 0, "VestingVaultWL: Not eligible");
		require(!claimed[msg.sender], "VestingVaultWL: claimed");

		// Mark as claimed
		claimed[msg.sender] = true;
		rMetis.transfer(msg.sender, whitelist[msg.sender]);

		emit Claimed(msg.sender, whitelist[msg.sender]);
	}
}
