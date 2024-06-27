import {ethers, getUnnamedAccounts} from 'hardhat';
import {Signer, parseEther} from 'ethers';
import {expect} from 'chai';
import {RMetis__factory, RMetis, VestingVaultWL__factory, VestingVaultWL} from '../typechain-types';
import {blockTimestamp, increaseSeconds} from './utils';

const getMockSnapshot = async () => {
	const users = await getUnnamedAccounts();
	const snapshot = users.map<[string, bigint]>((user, i) => [user, BigInt(ethers.parseEther((i + 1).toString()))]);
	const totalAirdrop = snapshot.reduce((res, [_, val]) => res + val, BigInt(0));
	return {
		snapshot: Object.fromEntries(snapshot), // For ease of address lookup
		totalAirdrop,
	};
};

const DAY_SECONDS = 24 * 60 * 60;
const PRECISION = BigInt(10000);

describe('VestingVaultWL', () => {
	let owner: Signer;
	let users: Signer[];
	let ownerAddress: string;
	let snapshot: {[k: string]: bigint}, totalAirdrop: bigint;

	let rMetis: RMetis;
	let rMetisAddress: string;
	let vestingVault: VestingVaultWL;
	let vestingAddress: string;

	let airdropDurationDays: number;
	let startDate: number;
	let endDate: number;
	let minPrice: bigint;
	let maxPrice: bigint;

	beforeEach(async () => {
		[owner, ...users] = await ethers.getSigners();
		ownerAddress = await owner.getAddress();

		const mockSnapshot = await getMockSnapshot();
		snapshot = mockSnapshot.snapshot;
		totalAirdrop = mockSnapshot.totalAirdrop;

		const VestingVaultWLFactory = new VestingVaultWL__factory(owner);

		airdropDurationDays = 7;
		startDate = (await blockTimestamp()) as number;
		endDate = startDate + 1000 * DAY_SECONDS;
		minPrice = BigInt(5000);
		maxPrice = BigInt(10000);

		vestingVault = await VestingVaultWLFactory.deploy(
			'0x0000000000000000000000000000000000000000000000000000000000000000',
			airdropDurationDays,
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

	it('Should whitelist the users', async () => {
		let usersAddresses = [await users[0].getAddress(), await users[1].getAddress(), await users[2].getAddress()];
		let amounts = usersAddresses.map((addy) => snapshot[addy]);
		await vestingVault.addWhitelist(usersAddresses, amounts);

		const is0Whitelisted = await vestingVault.whitelist(usersAddresses[0]);
		const is1Whitelisted = await vestingVault.whitelist(usersAddresses[1]);
		const is2Whitelisted = await vestingVault.whitelist(usersAddresses[2]);
		const is3Whitelisted = await vestingVault.whitelist(await users[3].getAddress());

		expect(is0Whitelisted).to.be.equal(amounts[0]);
		expect(is1Whitelisted).to.be.equal(amounts[1]);
		expect(is2Whitelisted).to.be.equal(amounts[2]);
		expect(is3Whitelisted).to.be.equal(0n);
	});

	it('Should be able to claim the tokens before the deadline, should revert if tampered with amount or proof', async () => {
		const usr1 = users[0];
		const usr1Address = await usr1.getAddress();
		const usr1Amount = snapshot[usr1Address];

		const usr2 = users[1];
		const usr2Address = await usr2.getAddress();
		const usr2Amount = snapshot[usr2Address];

		const usr3 = users[2];
		const usr3Address = await usr3.getAddress();
		const usr3Amount = snapshot[usr3Address];

		const usr4 = users[3];
		const usr4Address = await usr4.getAddress();
		const usr4Amount = snapshot[usr4Address];

		const thisAirdrop = usr1Amount + usr2Amount + usr3Amount + usr4Amount;

		// Deposit amount by owner
		await vestingVault.deposit({value: thisAirdrop});
		await vestingVault.addWhitelist([usr1Address, usr2Address, usr3Address], [usr1Amount, usr2Amount, usr3Amount]);

		const usr1Balance = await rMetis.balanceOf(usr1Address);
		expect(usr1Balance).to.equal(0);
		const usr2Balance = await rMetis.balanceOf(usr2Address);
		expect(usr2Balance).to.equal(0);

		// Claim by usr1
		await vestingVault.connect(usr1).claimWhitelist();
		const usr1BalanceAfter = await rMetis.balanceOf(usr1Address);
		expect(usr1BalanceAfter).to.equal(usr1Amount);

		await vestingVault.connect(usr2).claimWhitelist();
		const usr2BalanceAfter = await rMetis.balanceOf(usr2Address);
		expect(usr2BalanceAfter).to.equal(usr2Amount);

		await expect(vestingVault.connect(usr4).claimWhitelist()).to.be.revertedWith('VestingVaultWL: Not eligible');

		await expect(vestingVault.connect(usr1).claimWhitelist()).to.be.revertedWith('VestingVaultWL: claimed');
		await expect(vestingVault.connect(usr2).claimWhitelist()).to.be.revertedWith('VestingVaultWL: claimed');

		// Claim by usr3 after deadline reverts
		await increaseSeconds(airdropDurationDays * DAY_SECONDS + 1);
		await expect(vestingVault.connect(usr3).claimWhitelist()).to.be.revertedWith(
			'VestingVault: Claim deadline has passed.'
		);
	});
});
