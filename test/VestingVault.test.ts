import {ethers, getNamedAccounts, getUnnamedAccounts, artifacts} from 'hardhat';
import {Contract, Signer, parseEther} from 'ethers';
import {expect} from 'chai';
import {RMetis__factory, VestingVault__factory, RMetis, VestingVault} from '../typechain-types';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {BigNumber} from '@ethersproject/bignumber';
import {blockTimestamp, increaseSeconds} from './utils';
import {start} from 'repl';

const getMockSnapshot = async () => {
	const users = await getUnnamedAccounts();
	const snapshot = users.map<[string, bigint]>((user, i) => [user, BigInt(ethers.parseEther((i + 1).toString()))]);
	const totalAirdrop = snapshot.reduce((res, [_, val]) => res + val, BigInt(0));
	const merkleTree = StandardMerkleTree.of(snapshot, ['address', 'uint256']);
	return {
		snapshot: Object.fromEntries(snapshot), // For ease of address lookup
		merkleTree,
		totalAirdrop,
	};
};

const getLeafIndex = (address: string, merkleTree: StandardMerkleTree<[string, bigint]>) => {
	const leaf = Array.from(merkleTree.entries()).find(([_, [addy]]) => addy === address);
	if (!leaf) throw new Error(`Address ${address} not found in merkle tree`);
	return leaf[0];
};

const DAY_SECONDS = 24 * 60 * 60;
const PRECISION = BigInt(10000);
const METIS_NATIVE_ADDRESS = '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000';

describe('VestingVault', () => {
	let owner: Signer;
	let users: Signer[];
	let ownerAddress: string;
	let snapshot: {[k: string]: bigint}, merkleTree: StandardMerkleTree<[string, bigint]>, totalAirdrop: bigint;

	let rMetis: RMetis;
	let rMetisAddress: string;
	let vestingVault: VestingVault;
	let vestingAddress: string;

	let claimDeadline: number;
	let startDate: number;
	let endDate: number;
	let minPrice: bigint;
	let maxPrice: bigint;

	beforeEach(async () => {
		[owner, ...users] = await ethers.getSigners();
		ownerAddress = await owner.getAddress();

		const mockSnapshot = await getMockSnapshot();
		snapshot = mockSnapshot.snapshot;
		merkleTree = mockSnapshot.merkleTree;
		totalAirdrop = mockSnapshot.totalAirdrop;

		const VestingVaultFactory = new VestingVault__factory(owner);

		startDate = (await blockTimestamp()) as number;
		claimDeadline = startDate + 7 * DAY_SECONDS;
		endDate = startDate + 1000 * DAY_SECONDS;
		minPrice = BigInt(5000);
		maxPrice = BigInt(10000);

		vestingVault = await VestingVaultFactory.deploy(
			merkleTree.root,
			claimDeadline,
			startDate,
			endDate,
			minPrice,
			maxPrice
		);

		vestingAddress = (await vestingVault.getAddress()).toString();
		rMetisAddress = (await vestingVault.rMetis()).toString();
		const RMetisFactory = new RMetis__factory(owner);
		rMetis = RMetisFactory.attach(rMetisAddress) as RMetis;
	});

	it('Should deposit and mint the tokens multiple times', async () => {
		await vestingVault.deposit({value: ethers.parseEther('10')});
		expect(await ethers.provider.getBalance(vestingAddress)).to.equal(ethers.parseEther('10'));
		// Deposit again
		await vestingVault.deposit({value: ethers.parseEther('2')});
		expect(await ethers.provider.getBalance(vestingAddress)).to.equal(ethers.parseEther('12'));
		// Yet again
		await vestingVault.deposit({value: totalAirdrop});
		expect(await ethers.provider.getBalance(vestingAddress)).to.equal(ethers.parseEther('12') + totalAirdrop);
	});

	it('Should pause and unpause the contract', async () => {
		await vestingVault.pause();
		expect(await vestingVault.paused()).to.equal(true);
		await vestingVault.unPause();
		expect(await vestingVault.paused()).to.equal(false);
	});

	it('Should be able to claim the tokens before the deadline, should revert if tampered with amount or proof', async () => {
		const usr1 = users[0];
		const usr1Address = await usr1.getAddress();
		const usr1Amount = snapshot[usr1Address];
		const usr1Leaf: [string, bigint] = [usr1Address, usr1Amount];
		const usr1Proof = merkleTree.getProof(usr1Leaf);

		const usr2 = users[1];
		const usr2Address = await usr2.getAddress();
		const usr2Amount = snapshot[usr2Address];
		const usr2Leaf: [string, bigint] = [usr2Address, usr2Amount];
		const usr2Proof = merkleTree.getProof(usr2Leaf);

		const usr3 = users[2];
		const usr3Address = await usr3.getAddress();
		const tamperedSnapshot = {...snapshot, [usr3Address]: snapshot[usr3Address] + parseEther('1')};
		const tamperedMerkleTree = StandardMerkleTree.of(Object.entries(tamperedSnapshot), ['address', 'uint256']);
		const usr3Amount = tamperedSnapshot[usr3Address]; // tamper with the amount
		const usr3LeafIndex = getLeafIndex(usr3Address, merkleTree);
		const usr3Leaf: [string, bigint] = [usr3Address, usr3Amount];
		const usr3Proof = merkleTree.getProof(usr3LeafIndex);
		const usr3TamperedProof = tamperedMerkleTree.getProof(usr3Leaf); // Try again, this time tamper with the proof and the tree

		const usr4 = users[3];
		const usr4Address = await usr4.getAddress();
		const usr4Amount = snapshot[usr4Address];
		const usr4Leaf: [string, bigint] = [usr4Address, usr4Amount];
		const usr4Proof = merkleTree.getProof(usr4Leaf);

		const thisAirdrop = usr1Amount + usr2Amount + (usr3Amount - parseEther('1')) + usr4Amount;

		// Deposit amount by owner
		await vestingVault.deposit({value: thisAirdrop});

		const usr1Balance = await rMetis.balanceOf(usr1Address);
		expect(usr1Balance).to.equal(0);
		const usr2Balance = await rMetis.balanceOf(usr2Address);
		expect(usr2Balance).to.equal(0);

		// Claim by usr1
		await vestingVault.connect(usr1).claim(usr1Amount, usr1Proof);
		const usr1BalanceAfter = await rMetis.balanceOf(usr1Address);
		expect(usr1BalanceAfter).to.equal(usr1Amount);

		await vestingVault.connect(usr2).claim(usr2Amount, usr2Proof);
		const usr2BalanceAfter = await rMetis.balanceOf(usr2Address);
		expect(usr2BalanceAfter).to.equal(usr2Amount);

		// Claim by usr3 reverts due to tamper with the amount
		await expect(vestingVault.connect(usr3).claim(usr3Amount, usr3Proof)).to.be.revertedWith(
			'VestingVault: Invalid proof.'
		);
		await expect(vestingVault.connect(usr3).claim(usr3Amount, usr3TamperedProof)).to.be.revertedWith(
			'VestingVault: Invalid proof.'
		);

		// Claim by usr4 after deadline reverts
		await increaseSeconds(airdropDurationDays * DAY_SECONDS + 1);
		await expect(vestingVault.connect(usr4).claim(usr4Amount, usr4Proof)).to.be.revertedWith(
			'VestingVault: Claim deadline has passed.'
		);
	});
	it('Owner should be able to claim the remaining rMetis tokens after the airdrop ends', async () => {
		const usr1 = users[0];
		const usr1Address = await usr1.getAddress();
		const usr1Amount = snapshot[usr1Address];
		const usr1Leaf: [string, bigint] = [usr1Address, usr1Amount];
		const usr1Proof = merkleTree.getProof(usr1Leaf);

		await vestingVault.deposit({value: totalAirdrop});
		const balanceBefore = await rMetis.balanceOf(ownerAddress);
		expect(balanceBefore).to.equal(0);
		expect(vestingVault.claimOwner()).to.be.revertedWith('VestingVault: Claim deadline has not passed.');

		// Claim by usr1
		await vestingVault.connect(usr1).claim(usr1Amount, usr1Proof);

		await increaseSeconds(airdropDurationDays * DAY_SECONDS + 1);
		await vestingVault.claimOwner();
		const balanceAfter = await rMetis.balanceOf(ownerAddress);
		expect(balanceAfter).to.equal(totalAirdrop - usr1Amount);
	});
	it('Should calculate the ratio correctly according to the vesting cliff', async () => {
		await vestingVault.deposit({value: totalAirdrop});
		const ratio = await vestingVault.connect(users[0]).priceRatio();
		// Some time has passed since deployment
		expect(ratio).to.equal(minPrice);

		const secondsToQuarterWay = (endDate - startDate) / 4;
		const quarterRatioDiff = (maxPrice - minPrice) / BigInt(4);
		await increaseSeconds(secondsToQuarterWay);
		const ratio2 = await vestingVault.connect(users[0]).priceRatio();
		expect(ratio2).to.equal(minPrice + quarterRatioDiff);

		await increaseSeconds(secondsToQuarterWay * 3);
		const ratio3 = await vestingVault.connect(users[0]).priceRatio();
		expect(ratio3).to.equal(maxPrice);
	});
	it('Should be able to redeem rMetis for Metis tokens at different ratios', async () => {
		const usr1 = users[0];
		const usr1Address = await usr1.getAddress();
		const usr1Amount = snapshot[usr1Address];
		const usr1Leaf: [string, bigint] = [usr1Address, usr1Amount];
		const usr1Proof = merkleTree.getProof(usr1Leaf);

		await vestingVault.deposit({value: totalAirdrop});

		// Claim by usr1
		const usr1BalanceBefore = await rMetis.balanceOf(usr1Address);
		await vestingVault.connect(usr1).claim(usr1Amount, usr1Proof);
		const usr1BalanceAfter = await rMetis.balanceOf(usr1Address);

		// Redeem rMetis for Metis by usr1 first day
		const ratio = await vestingVault.priceRatio();
		const metisAmount = (usr1Amount * ratio) / PRECISION;
		const usr1MetisBalanceBefore = await ethers.provider.getBalance(usr1Address);

		await rMetis.connect(usr1).approve(vestingAddress, usr1Amount);
		await vestingVault.connect(usr1).redeem(usr1Amount);
		const usr1RmetisBalanceAfter = await rMetis.balanceOf(usr1Address);
		const usr1MetisBalanceAfter = await ethers.provider.getBalance(usr1Address);

		expect(usr1RmetisBalanceAfter).to.equal(0);
		expect(usr1MetisBalanceAfter - (usr1MetisBalanceBefore + metisAmount)).to.be.lessThan(200000000000000n);
	});
	it('Owner should be able to redeem at a 1/1 ratio at all times', async () => {
		await vestingVault.deposit({value: totalAirdrop});
		await increaseSeconds(airdropDurationDays * DAY_SECONDS + 1);
		await vestingVault.claimOwner();

		const ratio = await vestingVault.priceRatio();
		expect(ratio).to.be.lessThan(maxPrice);

		await rMetis.connect(owner).approve(vestingAddress, totalAirdrop);
		const metisBalanceBefore = await ethers.provider.getBalance(ownerAddress);
		await vestingVault.connect(owner).redeem(totalAirdrop);
		const rMetisBalanceAfter = await rMetis.balanceOf(ownerAddress);
		const metisBalanceAfter = await ethers.provider.getBalance(ownerAddress);

		expect(rMetisBalanceAfter).to.equal(0);
		expect(metisBalanceAfter - (metisBalanceBefore + totalAirdrop)).to.be.lessThan(200000000000000n);
	});
	it('Owner should be able to emergency recover rMetis and Metis tokens', async () => {
		await vestingVault.deposit({value: totalAirdrop});
		const rMetisBalance = await rMetis.balanceOf(ownerAddress);
		await vestingVault.emergencyRecoverToken(rMetisAddress, totalAirdrop);
		const rMetisBalanceAfter = await rMetis.balanceOf(ownerAddress);

		expect(rMetisBalanceAfter).to.equal(rMetisBalance + totalAirdrop);
	});

	// Add more tests as needed for other functions
});
