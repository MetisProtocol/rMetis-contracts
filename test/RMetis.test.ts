import {Signer} from 'ethers';
import {RMetis, RMetis__factory} from '../typechain-types';
import {ethers} from 'hardhat';
import {expect} from 'chai';

describe('RMetis', () => {
	let rMetis: RMetis;
	let owner: Signer;
	let addr1: Signer;
	let ownerAddress: string;
	let addr1Address: string;

	beforeEach(async () => {
		[owner, addr1] = await ethers.getSigners();
		ownerAddress = await owner.getAddress();
		addr1Address = await addr1.getAddress();

		const RMetisFactory = new RMetis__factory(owner);
		rMetis = await RMetisFactory.deploy();
	});

	it('Should mint tokens only by owner', async () => {
		await expect(rMetis.connect(addr1).mint(100)).to.be.revertedWith('Ownable: caller is not the owner');
		await rMetis.mint(100);
		expect(await rMetis.balanceOf(ownerAddress)).to.equal(100);
	});

	it('Should burn the tokens', async () => {
		await rMetis.mint(200);
		await rMetis.burn(50);
		expect(await rMetis.balanceOf(ownerAddress)).to.equal(150);
	});
});
