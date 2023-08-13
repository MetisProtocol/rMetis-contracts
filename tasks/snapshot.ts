import {task} from 'hardhat/config';
import fs from 'fs';
import {BigNumber} from '@ethersproject/bignumber';
import {AnkrProvider, Blockchain, GetLogsReply} from '@ankr.com/ankr.js';

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
			accounts: Record<string, BigNumber> = {},
			logsCnt = 0;

		const stream = fs.createWriteStream(`snapshots/${network.name}-${token}-${startblock}-${endblock}.json`, {
			flags: 'w',
		});

		do {
			// Relentless
			let response: GetLogsReply;
			try {
				// use ankr_getLogs instead of eth_getLogs to avoid rate limiting
				response = await ankr.getLogs({
					blockchain: network.name as Blockchain,
					fromBlock: startblock,
					toBlock: endblock,
					topics: [[ethers.id('Transfer(address,address,uint256)')]],
					address: token,
					pageSize: 10000,
					decodeLogs: true,
					pageToken,
				});
			} catch (e) {
				continue;
			}

			if (!response.logs.length) break;
			pageToken = response.nextPageToken;

			logsCnt += response.logs.length;
			process.stdout.write(`\r${logsCnt} logs fetched `);

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
				.sort((a, b) => (a[1].eq(b[1]) ? Number(b[0] > a[0] ? 1 : -1) : b[1].gt(a[1]) ? 1 : -1))
				.map(([key, value]) => [key, value.toHexString()])
		);
		stream.write(JSON.stringify(snapshot, null, 4));
	});
