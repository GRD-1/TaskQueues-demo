import config from 'config';
import { Query } from '../models/max-balance.model';
import { EtherscanService } from '../services/etherscan.service';
import serviceProvider from './service-provider.util';

export default async function getQueryParams(query: Query): Promise<Query> {
  let { library, blocksAmount, lastBlock } = query;

  if (library === undefined) library = config.DEFAULT_QUERY.LIBRARY;
  else if (!config.LIBRARY_LIST.includes(query.library)) {
    throw new globalThis.SRV_ERROR('incorrect library name!');
  }

  if (blocksAmount === undefined) blocksAmount = config.DEFAULT_QUERY.BLOCKS_AMOUNT;
  else if (Number(blocksAmount) <= 0) throw new globalThis.SRV_ERROR('incorrect number of blocks!');
  else if (Number(blocksAmount) >= 20) {
    throw new globalThis.SRV_ERROR('too much blocks! the process will take a lot of time!');
  }

  if (lastBlock === undefined) {
    lastBlock = config.DEFAULT_QUERY.LAST_BLOCK;
  } else if (query.lastBlock === 'last') {
    const etherscan = serviceProvider.getService(EtherscanService);
    lastBlock = await etherscan.getLastBlockNumber();
  } else {
    const lastBlockNumberDecimal = parseInt(lastBlock, 16);
    if (Number.isNaN(lastBlockNumberDecimal) || lastBlockNumberDecimal < 2) {
      throw new globalThis.SRV_ERROR('incorrect last block number! It should be > 1');
    }
  }
  return { library, blocksAmount, lastBlock };
}
