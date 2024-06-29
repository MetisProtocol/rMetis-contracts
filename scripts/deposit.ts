import {deployments, getNamedAccounts, ethers} from 'hardhat';
const {execute} = deployments;

const amount = ethers.parseEther('1');

async function main() {
	const {deployer} = await getNamedAccounts();
	const tx = await execute('VestingVaultWL', {from: deployer, log: true, value: '0xde0b6b3a7640000'}, 'deposit');

	if (tx.status) {
		console.log(`Transaction submitted: ${tx.transactionHash}`);
		console.log(`Successfully deposited ${amount} into VestingVaultWhiteList contract`);
	} else {
		throw 'Something went wrong';
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
