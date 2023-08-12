// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title RMetis
 * @dev A specialized ERC20 token representing ReMetis Token (rMetis)
 * @author Rami Husami (gh: @t0mcr8se)
 */
contract RMetis is ERC20 {
	
	/**
	 * @notice Construct the RMetis token
	 * @param _maxSupply Maximum supply of the RMetis token
	 */
	constructor(uint256 _maxSupply) ERC20("ReMetis Token", "rMetis") {
		_mint(msg.sender, _maxSupply);
	}

	/**
	 * @notice Burn tokens from the caller
	 * @param amount Amount of tokens to burn
	 */
	function burn(uint256 amount) external {
		_burn(msg.sender, amount);
	}

}
