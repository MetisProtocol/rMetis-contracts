// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IRMetis
 * @dev Interface of the RMetis contract
 */
interface IRMetis is IERC20 {

    /**
     * @notice Burns an amount of RMetis tokens
     * @param amount Amount of RMetis tokens to burn
     */
    function burn(uint256 amount) external;
}
