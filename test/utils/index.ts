import {BaseContract} from 'ethers';
import {ethers} from 'hardhat';

export async function setupUsers<T extends {[contractName: string]: BaseContract}>(
	addresses: string[],
	contracts: T
): Promise<({address: string} & T)[]> {
	const users: ({address: string} & T)[] = [];
	for (const address of addresses) {
		users.push(await setupUser(address, contracts));
	}
	return users;
}

export async function setupUser<T extends {[contractName: string]: BaseContract}>(
	address: string,
	contracts: T
): Promise<{address: string} & T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const user: any = {address};
	for (const key of Object.keys(contracts)) {
		user[key] = contracts[key].connect(await ethers.getSigner(address));
	}
	return user as {address: string} & T;
}

export async function increaseSeconds(seconds: number | bigint): Promise<void> {
	await ethers.provider.send('evm_increaseTime', [seconds]);
	await ethers.provider.send('evm_mine', []);
}

export async function blockTimestamp(): Promise<number | undefined> {
	return (await ethers.provider.getBlock('latest'))?.timestamp;
}
