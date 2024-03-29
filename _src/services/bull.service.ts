import Bull from 'bull';
import net from 'net';
import config from 'config';
import { DownloadQueueFiller, QueueTaskArgs, DownloadWorkerArgs } from '../models/max-balance.model';
import { Service } from './service';
import { EtherscanService } from './etherscan.service';
import serviceProvider from '../utils/service-provider.util';

const queueSettings = {
  redis: config.REDIS,
  defaultJobOptions: config.BULL.JOB_OPTIONS,
  settings: config.BULL.SETTINGS,
  limiter: config.BULL.LIMITER,
};

export class BullService extends Service {
  protected _downloadQueue: Bull.Queue | undefined;
  protected _processQueue: Bull.Queue | undefined;

  get downloadQueue(): Bull.Queue {
    if (!this._downloadQueue) {
      this._downloadQueue = new Bull('downloadQueue', queueSettings);
    }
    return this._downloadQueue;
  }

  get processQueue(): Bull.Queue {
    if (!this._processQueue) {
      this._processQueue = new Bull('processQueue', queueSettings);
    }
    return this._processQueue;
  }

  async connectToServer(): Promise<void> {
    const redisServerHost = config.REDIS.host;
    const redisServerPort = config.REDIS.port;
    const socket = net.createConnection(redisServerPort, redisServerHost);

    return new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.end();
        resolve();
      });

      socket.on('error', () => {
        reject(new globalThis.SRV_ERROR('Error connecting to the Redis server!'));
      });
    });
  }

  async downloadData(): Promise<number> {
    this.numberOfProcessedTasks = 0;
    const startTime = Date.now();

    const queueFiller: DownloadQueueFiller = (args: QueueTaskArgs) => {
      const terminateTask = args.taskNumber >= this.blocksAmount;
      const task = JSON.stringify({ ...args, terminateTask, sessionKey: this.sessionKey });
      this.downloadQueue.add('downloadQueue', task, {});
    };
    this.fillTheQueue(queueFiller, this.lastBlock, this.blocksAmount);

    return new Promise((resolve, reject) => {
      this.downloadQueue.process('downloadQueue', async (job, done) => {
        await this.downloadQueueWorker({ task: job, startTime, resolve, reject }, done);
      });
    });
  }

  async downloadQueueWorker(args: DownloadWorkerArgs, callback: Bull.DoneCallback): Promise<void> {
    const { task, startTime, resolve, reject } = args;
    const taskContent = task !== null ? JSON.parse(task.data) : null;
    if (taskContent !== null && taskContent.sessionKey === this.sessionKey) {
      if (config.LOG_BENCHMARKS === true) console.log(`\ndownload queue iteration ${taskContent.taskNumber}`);
      this.numberOfProcessedTasks++;
      try {
        const etherscan = serviceProvider.getService(EtherscanService);
        const block = await etherscan.getBlock(taskContent.blockNumberHex);
        const processQueueTask = JSON.stringify({ ...taskContent, content: block });
        await this.processQueue.add('processQueue', processQueueTask);
        callback();
        if (this.numberOfProcessedTasks >= this.blocksAmount) {
          resolve((Date.now() - startTime) / 1000);
        }
      } catch (e) {
        callback(e);
        reject(e);
      }
    }
  }

  async processData(): Promise<number> {
    this.numberOfProcessedTasks = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.processQueue.process('processQueue', async (task, done) => {
        const taskContent = JSON.parse(task.data);
        await this.processQueueWorker({ ...taskContent, startTime, taskCallback: done, resolve, reject });
      });
    });
  }

  async cleanQueue(): Promise<void> {
    await this.downloadQueue?.pause(true, true);
    await this.processQueue?.pause(true, true);
    await this.downloadQueue?.obliterate({ force: true });
    await this.processQueue?.obliterate({ force: true });
  }
}
