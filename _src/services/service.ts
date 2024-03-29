import config from 'config';
import { SimpleIntervalJob, Task, ToadScheduler } from 'toad-scheduler';
import { Data, Account, DownloadQueueFiller, ProcessWorkerArgs } from '../models/max-balance.model';
import serviceProvider from '../utils/service-provider.util';

export abstract class Service {
  sessionKey: number;
  addressBalances: Account;
  maxAccount: Account;
  amountOfTransactions = 0;
  numberOfProcessedTasks = 0;
  terminateAllProcesses: boolean;

  constructor(public blocksAmount?: number, public lastBlock?: string) {
    this.sessionKey = Date.now();
  }

  async getMaxChangedBalance(): Promise<Data> {
    let result: Data;
    try {
      await this.connectToServer();
      result = await new Promise((resolve, reject) => {
        (async (): Promise<void> => {
          const errMsg = await this.setTimer(this.blocksAmount * config.WAITING_TIME_FOR_BLOCK);
          resolve(errMsg);
        })();

        (async (): Promise<void> => {
          try {
            const loadingTime = await this.downloadData();
            const processTime = await this.processData();
            const maxAccountParams = this.getMostChangedAccountParams();
            resolve({
              addressBalances: this.addressBalances,
              maxAccountAddress: maxAccountParams[0],
              maxAccountBalanceChange: maxAccountParams[1],
              amountOfTransactions: this.amountOfTransactions,
              processTime,
              loadingTime,
            });
          } catch (err) {
            reject(err);
          }
        })();
      });
    } catch (e) {
      globalThis.ERROR_EMITTER.emit('Error', e);
      result = { error: e.message };
    }
    await this.cleanQueue();
    return result;
  }

  fillTheQueue(queueFiller: DownloadQueueFiller, lastBlock: string, blocksAmount: number): SimpleIntervalJob[] {
    const lastBlockNumberDecimal = parseInt(lastBlock, 16);
    let taskNumber = 1;
    let blockNumberHex = (lastBlockNumberDecimal - taskNumber).toString(16);

    const scheduler = serviceProvider.getService(ToadScheduler);
    const task = new Task(
      'download block',
      () => {
        if (this.terminateAllProcesses) {
          scheduler.stop();
          return;
        }
        queueFiller({ taskNumber, blockNumberHex });
        if (taskNumber >= blocksAmount) scheduler.stop();
        taskNumber++;
        blockNumberHex = (lastBlockNumberDecimal - taskNumber).toString(16);
      },
      () => {
        scheduler.stop();
      },
    );
    const interval = config.DEFAULT_QUERY.REQUEST_INTERVAL;
    const job = new SimpleIntervalJob({ milliseconds: interval, runImmediately: true }, task, {
      id: 'download all blocks',
    });
    scheduler.addSimpleIntervalJob(job);
    return scheduler.getAllJobs() as SimpleIntervalJob[];
  }

  async processQueueWorker(args: ProcessWorkerArgs): Promise<void> {
    const { taskNumber, sessionKey, content, startTime } = args;
    const { taskCallback, resolve, reject } = args;
    if (content && sessionKey === this.sessionKey) {
      if (config.LOG_BENCHMARKS === true) console.log(`\nprocess queue iteration ${taskNumber}`);
      this.numberOfProcessedTasks++;
      try {
        if (content.result.transactions) {
          this.addressBalances = content.result.transactions.reduce((accum, item) => {
            this.amountOfTransactions++;
            const val = Number(item.value);
            accum[item.to] = (accum[item.to] || 0) + val;
            accum[item.from] = (accum[item.from] || 0) - val;
            this.maxAccount = this.getMostChangedAccount(
              { [item.to]: accum[item.to] },
              { [item.from]: accum[item.from] },
              this.maxAccount,
            );
            return accum;
          }, {});
        }
        if (taskCallback) taskCallback(null);
        if (this.numberOfProcessedTasks >= this.blocksAmount) {
          if (resolve) resolve((Date.now() - startTime) / 1000);
        }
      } catch (e) {
        if (taskCallback) taskCallback(e);
        if (reject) reject(e);
      }
    }
  }

  setTimer(awaitingTime: number): Promise<Data> {
    return new Promise((resolve) => {
      const scheduler = serviceProvider.getService(ToadScheduler);
      const task = new Task('deadline', () => {
        resolve({ error: `the waiting time has expired! (${awaitingTime} msec)` });
        scheduler.stop();
      });
      const job = new SimpleIntervalJob({ milliseconds: awaitingTime, runImmediately: false }, task);
      scheduler.addSimpleIntervalJob(job);
    });
  }

  getMostChangedAccount(...args: Account[]): Account {
    args.sort((a, b) => {
      const item1 = Number.isNaN(Math.abs(Object.values(a)[0])) ? 0 : Math.abs(Object.values(a)[0]);
      const item2 = Number.isNaN(Math.abs(Object.values(b)[0])) ? 0 : Math.abs(Object.values(b)[0]);
      if (item1 === item2) return 0;
      return item1 < item2 ? 1 : -1;
    });
    return args[0];
  }

  getMostChangedAccountParams(): [string, number] {
    let address: string;
    let balance: number;

    if (this.maxAccount) {
      const maxAccountData = Object.entries(this.maxAccount)[0];
      address = maxAccountData[0];
      balance = maxAccountData[1];
    }
    return [address, balance];
  }

  abstract connectToServer(): Promise<void>;

  abstract downloadData(): Promise<number>;

  abstract processData(): Promise<number>;

  abstract cleanQueue(): Promise<void>;
}
