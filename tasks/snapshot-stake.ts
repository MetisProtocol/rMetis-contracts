import {task} from 'hardhat/config';
import fs from 'fs';
import {BigNumber} from '@ethersproject/bignumber';
import {AnkrProvider, Blockchain, GetLogsReply} from '@ankr.com/ankr.js';

const {ANKR_API_URI, EXCLUDE_ADDRESSES} = process.env;

task('snapshot-stake', 'Generates snapshot of token stakers')
	.addParam('contract', 'staking address')
	.addParam('startblock', 'Starting block of the snapshot')
	.addParam('endblock', 'Ending block of the snapshot')
	.setAction(async (taskArgs, hre) => {
		const {contract, startblock, endblock} = taskArgs;
		const {ethers, network} = hre;

		const ankr = new AnkrProvider(ANKR_API_URI ?? '');
		console.log('ankr initiated', {ANKR_API_URI});

		let pageToken = undefined,
			accounts: Record<string, BigNumber> = {},
			logsCnt = 0;

		const stream = fs.createWriteStream(`snapshots/${network.name}-${contract}-${startblock}-${endblock}.json`, {
			flags: 'w',
		});
		console.log({contract, startblock, endblock});

		do {
			// Relentless
			let response: GetLogsReply;
			try {
				console.log(`Requesting page ${pageToken}`);
				// use ankr_getLogs instead of eth_getLogs to avoid rate limiting
				response = await ankr.getLogs({
					blockchain: network.name as Blockchain,
					fromBlock: startblock,
					toBlock: endblock,
					topics: [
						'0x90890809c654f11d6e72a28fa60149770a0d11ec6c92319d6ceb2bb0a4ea1a15',
						[],
						'0x0000000000000000000000000000000000000000000000000000000000000064',
					],
					address: contract,
					pageSize: 10000,
					decodeLogs: true,
					pageToken,
				});
			} catch (e) {
				console.log({e});
				continue;
			}

			if (!response.logs.length) break;
			pageToken = response.nextPageToken;

			logsCnt += response.logs.length;
			process.stdout.write(`${logsCnt} deposit logs fetched \n`);

			response.logs.forEach((log) => {
				if (!log.event) return;
				const [from, _pid, value] = log.event.inputs.map((i) => i.valueDecoded);
				accounts[from] = (accounts[from] || BigNumber.from(0)).add(
					EXCLUDE_ADDRESSES?.includes(from) ? BigNumber.from(0) : value
				);
			});
		} while (pageToken);

		pageToken = undefined;

		do {
			// Relentless
			let response: GetLogsReply;
			try {
				console.log(`Requesting page ${pageToken}`);
				// use ankr_getLogs instead of eth_getLogs to avoid rate limiting
				response = await ankr.getLogs({
					blockchain: network.name as Blockchain,
					fromBlock: startblock,
					toBlock: endblock,
					topics: [
						'0xf279e6a1f5e320cca91135676d9cb6e44ca8a08c0b88342bcdb1144f6511b568',
						[],
						'0x0000000000000000000000000000000000000000000000000000000000000064',
					],
					address: contract,
					pageSize: 10000,
					decodeLogs: true,
					pageToken,
				});
			} catch (e) {
				console.log({e});
				continue;
			}

			if (!response.logs.length) break;
			pageToken = response.nextPageToken;

			logsCnt += response.logs.length;
			process.stdout.write(`${logsCnt} withdraw logs fetched \n`);

			response.logs.forEach((log) => {
				if (!log.event) return;
				const [from, _pid, value] = log.event.inputs.map((i) => i.valueDecoded);
				accounts[from] = (accounts[from] || BigNumber.from(0)).sub(
					EXCLUDE_ADDRESSES?.includes(from) ? BigNumber.from(0) : value
				);
			});
		} while (pageToken);

		let snapshot = Object.fromEntries(
			Object.entries(accounts)
				.filter(([_, value]) => value.gt(BigNumber.from(0)))
				.sort((a, b) => (a[1].eq(b[1]) ? Number(b[0] > a[0] ? 1 : -1) : b[1].gt(a[1]) ? 1 : -1))
				.map(([key, value]) => [key, value.toHexString()])
		);
		stream.write(JSON.stringify(snapshot, null, 4));
	});
