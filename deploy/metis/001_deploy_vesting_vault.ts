import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {VestingVault} from '../../typechain-types';
import fs from 'fs';
import {formatEther} from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {ethers, getNamedAccounts, artifacts} = hre;
	const {deployer} = await getNamedAccounts();
	const {deploy, save} = hre.deployments;

	const merkleTree = StandardMerkleTree.load(
		JSON.parse(
			fs.readFileSync(
				// 'snapshots/merkle-bsc-0xd4cec732b3b135ec52a3c0bc8ce4b8cfb9dace46-24822191-29591664.json',
				'snapshots/merkle-bsc-0x69afe59e88614501c3fdeb7480f12dba0a414032-11428544-29591664.json',
				'utf-8'
			)
		)
	);

	const rootHash = merkleTree.root;

	const sum = Array.from(merkleTree.entries()).reduce<bigint>((res, [i, val]) => {
		return res + BigInt(val[1]);
	}, BigInt(0));

	console.log(`Airdrop size: ${formatEther(sum.toString())}`);
	return;
};
export default func;
func.id = 'deploy_vesting-vault'; // id required to prevent reexecution
func.tags = ['VestingVault', 'RMetis'];
