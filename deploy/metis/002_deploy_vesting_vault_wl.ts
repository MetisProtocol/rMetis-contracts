import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {VestingVaultWL} from '../../typechain-types';
import fs from 'fs';
import {formatEther} from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {ethers, getNamedAccounts, artifacts} = hre;
	const {deployer} = await getNamedAccounts();
	const {deploy, save} = hre.deployments;

	const merkleTree = StandardMerkleTree.load(
		JSON.parse(
			fs.readFileSync(
				// 'snapshots/merkle-full-lp-snapshot-0.json',
				'snapshots/merkle-full-lp-snapshot-0dev.json',
				'utf-8'
			)
		)
	);

	const rootHash = merkleTree.root;

	const sum = Array.from(merkleTree.entries()).reduce<bigint>((res, [i, val]) => {
		return res + BigInt(val[1]);
	}, BigInt(0));

	console.log(`Airdrop size: ${formatEther(sum.toString())}`);

	const {AIRDROP_DURATION_DAYS, REDEMPTION_START_DATE, REDEMPTION_END_DATE, MIN_PRICE, MAX_PRICE} = process.env;

	await deploy('VestingVaultWL', {
		from: deployer,
		args: [rootHash, AIRDROP_DURATION_DAYS, REDEMPTION_START_DATE, REDEMPTION_END_DATE, MIN_PRICE, MAX_PRICE],
		log: true,
		autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
	});

	const vvwl = await ethers.getContract<VestingVaultWL>('VestingVaultWL', deployer);
	const rmetis = await vvwl.rMetis();

	await save('RMetisWL', {
		address: rmetis,
		abi: (await artifacts.readArtifact('RMetis')).abi,
	});
};
export default func;
func.id = 'deploy_vesting-vault'; // id required to prevent reexecution
func.tags = ['VestingVault', 'RMetis'];
