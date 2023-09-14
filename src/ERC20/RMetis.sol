// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RMetis
 * @dev A specialized ERC20 token representing ReMetis Token (rMetis)
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract RMetis is ERC20, Ownable {
	/**
	 * @notice Construct the RMetis token
	 */
	constructor() ERC20("ReMetis Token", "rMetis") {}

	/**
	 * @notice Burn tokens from the caller
	 * @param amount Amount of tokens to burn
	 */
	function burn(uint256 amount) external {
		_burn(msg.sender, amount);
	}

	/**
	 * @notice Mint tokens to the owner
	 * @param amount Amount of tokens to mint
	 */
	function mint(uint256 amount) external onlyOwner {
		_mint(msg.sender, amount);
	}
}
