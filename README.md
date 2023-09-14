## Technical Specification: VestingVault Contract

## Overview:

The `VestingVault` contract aims to manage the distribution and vesting of RMetis tokens. It provides functionality to claim and redeem these tokens over a specified duration.

### 4. Key Functionality:

-   Managing the airdrop of rMetis tokens to users.
-   The airdrop will have a deadline, after which the contract owner can claim any unclaimed tokens.
-   The snapshot will be loaded onto a merkle tree, and the merkle root will be stored on-chain.
-   The merkle leaf will be hashed twice, following the `@openzeppelin/merkle-tree` structure: keccak256(abi.encodePacked(keccak256(abi.encode(recipient, amount)))).
-   The merkle proof will be validated on-chain to ensure that only legitimate users can claim the tokens.
-   The contract owner can pause and unpause the contract's functionalities.
-   The owner can set the deadline of the airdrop and the vesting period only at the deployment transaction.
-   The owner can set the minimum and maximum price of RMetis tokens only at the deployment transaction.
-   The price will change linearly from the minimum to the maximum price over the vesting period.
-   The holder of `amountRMetis` of rMetis token can redeem it for `amountMetis` of Metis token, where `amountMetis = amountRMetis * priceRatio()`.
-   slashedAmount <- (`amountMetis` - `amountRMetis`)
-   The owner can withdraw the slashed tokens.
-   The owner can withdraw any remaining rMetis tokens after the airdrop deadline.
-   The owner can redeem rMetis tokens for Metis tokens at a 1:1 ratio always.
-   The owner can recover any ERC20 tokens sent to the contract by mistake.
-   The users cannot claim when the contract is paused.
-   The users cannot redeem when the contract is paused.
-   The owner can always deposit metis tokens to the contract.
-   The RMetis contract is an ERC20 standard token with minting and burning capabilities.
-   The owner of RMetis contract is the VestingVault contract.
-   The VestingVault contract will be able to mint rMetis tokens and store them.### 6. Tests:

### 7. Security Measures:

-   The contract employs `ReentrancyGuard` to protect against recursive attacks by malicious users.
-   `Pausable` allows the owner to halt contract operations in case of any detected vulnerabilities.
-   Provides a merkle-proof based validation for token claims to ensure only legitimate users can claim the tokens.

## INSTALL

```bash
yarn
```

## TEST

There are 3 flavors of tests: hardhat, dapptools and forge

### hardhat

-   One using hardhat that can leverage hardhat-deploy to reuse deployment procedures and named accounts:

```bash
yarn test
```

### Deploy

```bash
yarn hardhat deploy --network metisgoerli
```
