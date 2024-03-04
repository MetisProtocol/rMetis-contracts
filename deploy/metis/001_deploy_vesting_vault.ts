import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {VestingVault} from '../../typechain-types';
import fs from 'fs';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {ethers, getNamedAccounts, artifacts} = hre;
	const {deployer} = await getNamedAccounts();
	const {deploy, save} = hre.deployments;

	const merkleTree = StandardMerkleTree.load(
		JSON.parse(
			fs.readFileSync(
				'snapshots/merkle-bsc-0xe552Fb52a4F19e44ef5A967632DBc320B0820639-11170743-29591664.json',
				// 'snapshots/merkle-dev-snapshot.json',
				'utf-8'
			)
		)
	);

	const rootHash = merkleTree.root;

	// const sum = Array.from(merkleTree.entries()).reduce<bigint>((res, [i, val]) => {
	// 	return res + BigInt(val[1]);
	// }, BigInt(0));

	// console.log(`Airdrop size: ${formatEther(sum.toString())}`);

	const {AIRDROP_DEADLINE, MIN_PRICE, MAX_PRICE, CLIFF, MAX_LENGTH} = process.env;

	await deploy('VestingVault', {
		from: deployer,
		proxy: {
			execute: {
				init: {
					methodName: 'initialize',
					args: [rootHash, AIRDROP_DEADLINE, MIN_PRICE, MAX_PRICE, CLIFF, MAX_LENGTH],
				},
			},
			proxyContract: 'OpenZeppelinTransparentProxy',
		},
		log: true,
		autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
	});

	// Save rMetis token
	const vestingVaultContract = await ethers.getContract<VestingVault>('VestingVault', deployer);
	const rMetisAddress = await vestingVaultContract.rMetis();
	await save('RMetis', {
		address: rMetisAddress,
		abi: (await artifacts.readArtifact('ERC1155PresetMinterPauser')).abi,
	});
};
export default func;
func.id = 'deploy_vesting-vault'; // id required to prevent reexecution
func.tags = ['VestingVault', 'RMetis'];
