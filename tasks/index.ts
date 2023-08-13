import {task} from 'hardhat/config';
import fs from 'fs';
import {BigNumber} from '@ethersproject/bignumber';
import {AnkrProvider, Blockchain, Log} from '@ankr.com/ankr.js';

const {ANKR_API_URI, EXCLUDE_ADDRESSES} = process.env;

task('snapshot', 'Generates snapshot of token holders')
	.addParam('token', 'Token address')
	.addParam('startblock', 'Starting block of the snapshot')
	.addParam('endblock', 'Ending block of the snapshot')
	.setAction(async (taskArgs, hre) => {
		const {token, startblock, endblock} = taskArgs;
		const {ethers, network} = hre;

		const ankr = new AnkrProvider(ANKR_API_URI ?? '');

		let pageToken = undefined,
			accounts: Record<string, BigNumber> = {};

		const stream = fs.createWriteStream(`snapshots/${network.name}-${token}-${startblock}-${endblock}.json`, {
			flags: 'w',
		});

		do {
			const response = await ankr.getLogs({
				blockchain: network.name as Blockchain,
				fromBlock: startblock,
				toBlock: endblock,
				topics: [[ethers.id('Transfer(address,address,uint256)')]],
				address: token,
				pageSize: 10000,
				decodeLogs: true,
				pageToken,
			});

			if (!response.logs.length) break;
			pageToken = response.nextPageToken;

			response.logs.forEach((log) => {
				if (!log.event) return;
				const [from, to, value] = log.event.inputs.map((i) => i.valueDecoded);
				accounts[from] = (accounts[from] || BigNumber.from(0)).sub(
					EXCLUDE_ADDRESSES?.includes(from) ? BigNumber.from(0) : value
				);
				accounts[to] = (accounts[to] || BigNumber.from(0)).add(
					EXCLUDE_ADDRESSES?.includes(to) ? BigNumber.from(0) : value
				);
			});
		} while (pageToken);
		let snapshot = Object.fromEntries(
			Object.entries(accounts)
				.filter(([_, value]) => value.gt(BigNumber.from(0)))
				.map(([key, value]) => [key, value.toHexString()])
		);
		stream.write(JSON.stringify(snapshot));
	});
