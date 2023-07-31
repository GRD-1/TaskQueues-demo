import amqp from 'amqplib/callback_api';
import amqp2 from 'amqplib';
import { SimpleIntervalJob, Task, ToadScheduler } from 'toad-scheduler';
import { Block, Data, Account, DownloadTaskArgs, DownloadWorker, ProcessWorker } from '../models/max-balance.model';

export class RabbitService {
  // downloadQueue: Bull.Queue;
  // processQueue: Bull.Queue;
  //
  constructor(public blocksAmount: number, public lastBlock: string) {
    //   const queueSettings = {
    //     redis: config.REDIS,
    //     defaultJobOptions: config.BULL.JOB_OPTIONS,
    //     settings: config.BULL.SETTINGS,
    //     limiter: config.BULL.LIMITER,
    //   };
    //   this.downloadQueue = new Bull('downloadQueue', queueSettings);
    //   this.processQueue = new Bull('processQueue', queueSettings);
  }

  async getMaxChangedBalance(): Promise<Data> {
    if (await this.isRabbitUnavailable()) return { error: new Error('Error connecting to RabbitMQ!') };
    const result = await new Promise((resolve) => {
      (async (): Promise<void> => {
        const errMsg = await this.setAwaitingTime(this.blocksAmount * 200);
        resolve(errMsg);
      })();

      (async (): Promise<void> => {
        const loadingTime = await this.downloadData();
        // const data = await this.processData();
        const data = {};
        resolve({ ...data, loadingTime });
      })();
    });
    // this.cleanQueue();
    return result;
  }

  async downloadData(): Promise<number> {
    await amqp.connect('amqp://rabbitmq', (error0, connection) => {
      if (error0) {
        throw error0;
      }
      connection.createChannel((error1, channel) => {
        if (error1) {
          throw error1;
        }

        channel.assertQueue('downloadQueue', {
          durable: true,
        });

        channel.sendToQueue('downloadQueue', Buffer.from('ravol'), {
          persistent: true,
        });
        channel.sendToQueue('downloadQueue', Buffer.from('valor'), {
          persistent: true,
        });
        channel.sendToQueue('downloadQueue', Buffer.from('latepia'), {
          persistent: true,
        });

        channel.consume(
          'downloadQueue',
          (message) => {
            setTimeout(() => {
              console.log(' [x] Received %s', message.content.toString());
            }, 1500);
          },
          {
            noAck: true,
          },
        );
      });
      // setTimeout(() => {
      //   connection.close();
      //   process.exit(0);
      // }, 500);
    });
    return new Promise((resolve) => {
      resolve(666);
    });

    //   const lastBlockNumberDecimal = parseInt(this.lastBlock, 16);
    //   let i = 0;
    //
    //   return new Promise((resolve) => {
    //     const startTime = Date.now();
    //     this.downloadQueue.on('completed', async () => {
    //       const jobs = await this.downloadQueue.getJobs(['completed']);
    //       if (jobs.length >= this.blocksAmount) resolve((Date.now() - startTime) / 1000);
    //     });
    //
    //     this.downloadQueue.add('downloadBlocks', {}, { repeat: { every: 200, limit: this.blocksAmount } });
    //     this.downloadQueue.process('downloadBlocks', async (job, done) => {
    //       try {
    //         ++i;
    //         if (config.LOG_BENCHMARKS === 'true') console.log(`\ndownload queue iteration ${i}`);
    //         const blockNumber = (lastBlockNumberDecimal - i).toString(16);
    //         const request = `${config.ETHERSCAN_API.GET_BLOCK}&tag=${blockNumber}&apikey=${config.ETHERSCAN_APIKEY}`;
    //         const response = await fetch(request);
    //         const block = (await response.json()) as Block;
    //         await this.processQueue.add('processBlocks', { block });
    //         const err = 'status' in block || 'error' in block ? Error(JSON.stringify(block.result)) : null;
    //         done(err);
    //       } catch (e) {
    //         console.error('downloadBlocks Error!', e);
    //         done(e);
    //       }
    //     });
    //   });
  }

  // async processData(): Promise<Data> {
  //   const startTime = Date.now();
  //   let addressBalances: Account = { '': 0 };
  //   let maxAccount: Account = { '': 0 };
  //   let i = 0;
  //   let amountOfTransactions = 0;
  //
  //   await new Promise((resolve) => {
  //     this.processQueue.on('completed', async () => {
  //       const jobs = await this.processQueue.getJobs(['completed']);
  //       if (jobs.length >= this.blocksAmount) resolve(null);
  //     });
  //
  //     this.processQueue.process('processBlocks', async (job, done) => {
  //       i++;
  //       if (config.LOG_BENCHMARKS === 'true') console.log(`\nprocess queue iteration ${i}`);
  //       const { transactions } = job.data.block.result;
  //       addressBalances = transactions.reduce((accum, item) => {
  //         amountOfTransactions++;
  //         const val = Number(item.value);
  //         accum[item.to] = (accum[item.to] || 0) + val;
  //         accum[item.from] = (accum[item.from] || 0) - val;
  //         maxAccount = this.getMaxAccount({ [item.to]: accum[item.to] }, { [item.from]: accum[item.from] }, maxAccount);
  //         return accum;
  //       }, {});
  //       done();
  //     });
  //   });
  //   const processTime = (Date.now() - startTime) / 1000;
  //   return { addressBalances, maxAccount, amountOfTransactions, processTime };
  // }
  //
  // getMaxAccount(...args: Account[]): Account {
  //   args.sort((a, b) => {
  //     const item1 = Number.isNaN(Math.abs(Object.values(a)[0])) ? 0 : Math.abs(Object.values(a)[0]);
  //     const item2 = Number.isNaN(Math.abs(Object.values(b)[0])) ? 0 : Math.abs(Object.values(b)[0]);
  //     if (item1 === item2) return 0;
  //     return item1 < item2 ? 1 : -1;
  //   });
  //   return args[0];
  // }

  setAwaitingTime(awaitingTime: number): Promise<Data> {
    return new Promise((resolve) => {
      const scheduler = new ToadScheduler();
      const task = new Task('deadline', () => {
        resolve({ error: { message: `the waiting time has expired! (${awaitingTime} msec)` } });
        scheduler.stop();
      });
      const job = new SimpleIntervalJob({ milliseconds: awaitingTime, runImmediately: false }, task);
      scheduler.addSimpleIntervalJob(job);
    });
  }

  async cleanQueue(): Promise<void> {
    try {
      const connection = await amqp2.connect('amqp://rabbitmq');
      const channel = await connection.createChannel();
      await channel.deleteQueue('ravoly');
      await channel.deleteQueue('valory');
      await channel.deleteQueue('downloadQueue');
      await channel.close();
      await connection.close();
    } catch (error) {
      console.error('Error occurred while deleting the queue:', error.message);
    }
  }

  async isRabbitUnavailable(): Promise<boolean> {
    try {
      amqp.connect('amqp://rabbitmq', (error0, connection) => {
        connection.close();
      });
      return false;
    } catch (error) {
      return true;
    }
  }
}
