import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import fs from 'fs';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployer} = await hre.getNamedAccounts();
	const {deploy} = hre.deployments;

	const merkleTree = StandardMerkleTree.load(
		JSON.parse(
			fs.readFileSync(
				'snapshots/merkle-bsc-0xe552Fb52a4F19e44ef5A967632DBc320B0820639-11170743-29591664.json',
				'utf-8'
			)
		)
	);
	const rootHash = merkleTree.root;
	const {AIRDROP_DURATION_DAYS, REDEMPTION_START_DATE, REDEMPTION_END_DATE, MIN_PRICE, MAX_PRICE} = process.env;

	await deploy('VestingVault', {
		from: deployer,
		args: [rootHash, AIRDROP_DURATION_DAYS, REDEMPTION_START_DATE, REDEMPTION_END_DATE, MIN_PRICE, MAX_PRICE],
		log: true,
		autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
	});
};
export default func;
func.id = 'deploy_voting_system'; // id required to prevent reexecution
func.tags = ['VotingSystem', 'VotingToken'];
