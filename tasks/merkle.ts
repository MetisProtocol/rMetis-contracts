import {task} from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import {BigNumber} from '@ethersproject/bignumber';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';

task('merkle', 'Generates snapshot of token holders')
	.addParam('snapshot', 'Path to snapshot json file')
	.setAction(async (taskArgs) => {
		const {snapshot} = taskArgs;

		const fd = fs.readFileSync(snapshot, {encoding: 'utf-8'});
		const balances = JSON.parse(fd.toString());

		const values = Object.entries(balances);
		const sum = values.reduce((acc, [_, value]) => acc.add(BigNumber.from(value)), BigNumber.from(0));

		console.log(`Total distribution: ${sum.toString()}`);

		const tree = StandardMerkleTree.of(values, ['address', 'uint256']);
		console.log(`Merkle root: ${tree.root}`);

		const filename = `snapshots/merkle-${path.parse(snapshot).base}`;
		fs.writeFileSync(filename, JSON.stringify(tree.dump(), null, 4));
		console.log(`Merkle tree saved to ${filename}`);
	});
