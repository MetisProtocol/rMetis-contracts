import {deployments, getNamedAccounts} from 'hardhat';
const {execute} = deployments;

const newOwner = '0x0Cd1C2807FA08AebE49A2E5101BC47b8DdB34334';

async function main() {
	const {deployer} = await getNamedAccounts();
	const tx = await execute('VestingVaultWL', {from: deployer, log: true}, 'transferOwnership', newOwner);

	if (tx.status) {
		console.log(`Transaction submitted: ${tx.transactionHash}`);
		console.log(`Successfully transferred ownership of VVWL to ${newOwner}`);
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
