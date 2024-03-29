import { Connection, connect, Channel } from 'amqplib';
import config from 'config';
import { QueueTaskArgs, DownloadWorkerArgs } from '../models/max-balance.model';
import { Service } from './service';
import { EtherscanService } from './etherscan.service';
import serviceProvider from '../utils/service-provider.util';

export class RabbitmqService extends Service {
  protected connection: Connection;
  protected downloadChannel: Channel;
  protected processChannel: Channel;

  async getDownloadChannel(): Channel {
    if (!this.downloadChannel) {
      this.downloadChannel = await this.connection.createChannel();
    }
    return this.downloadChannel;
  }

  async getProcessChannel(): Channel {
    if (!this.processChannel) {
      this.processChannel = await this.connection.createChannel();
    }
    return this.processChannel;
  }

  async connectToServer(): Promise<void> {
    try {
      this.connection = await connect(`amqp://${config.RABBIT.host}`);
      await this.getDownloadChannel();
      await this.getProcessChannel();
    } catch (e) {
      throw new globalThis.SRV_ERROR('Error connecting to the RabbitMQ server!');
    }
  }

  async downloadData(): Promise<number> {
    this.numberOfProcessedTasks = 0;
    const startTime = Date.now();
    await this.downloadChannel.assertQueue('downloadQueue', { durable: true });
    await this.downloadChannel.assertQueue('processQueue', { durable: true });

    const queueFiller = (args: QueueTaskArgs): void => {
      const terminateTask = args.taskNumber >= this.blocksAmount;
      const task = JSON.stringify({ ...args, terminateTask, sessionKey: this.sessionKey });
      this.downloadChannel.sendToQueue('downloadQueue', Buffer.from(task), { persistent: true });
    };
    this.fillTheQueue(queueFiller, this.lastBlock, this.blocksAmount);

    return new Promise((resolve, reject) => {
      this.downloadChannel.consume('downloadQueue', async (task) => {
        await this.downloadQueueWorker({ task, startTime, resolve, reject });
      });
    });
  }

  async downloadQueueWorker(args: DownloadWorkerArgs): Promise<void> {
    const { task, startTime, resolve, reject } = args;
    const taskContent = task !== null ? JSON.parse(task.content) : null;
    if (taskContent !== null && taskContent.sessionKey === this.sessionKey) {
      if (config.LOG_BENCHMARKS === true) console.log(`\ndownload queue iteration ${taskContent.taskNumber}`);
      this.numberOfProcessedTasks++;
      try {
        const etherscan = serviceProvider.getService(EtherscanService);
        const block = await etherscan.getBlock(taskContent.blockNumberHex);
        const processQueueTask = JSON.stringify({ ...taskContent, content: block });
        await this.downloadChannel.sendToQueue('processQueue', Buffer.from(processQueueTask), {
          persistent: true,
        });
        this.downloadChannel.ack(task);
        if (this.numberOfProcessedTasks >= this.blocksAmount) {
          resolve((Date.now() - startTime) / 1000);
        }
      } catch (e) {
        reject(e);
      }
    }
  }

  async processData(): Promise<number> {
    this.numberOfProcessedTasks = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.processChannel.consume('processQueue', async (task) => {
        const taskContent = task !== null ? JSON.parse(task.content) : null;
        if (taskContent) {
          await this.processQueueWorker({ ...taskContent, startTime, resolve, reject });
        }
      });
    });
  }

  async cleanQueue(): Promise<void> {
    await this.downloadChannel?.deleteQueue('downloadQueue');
    await this.downloadChannel?.deleteQueue('processQueue');
    await this.downloadChannel?.close();
    await this.processChannel?.close();
    this.connection?.close();
  }
}
