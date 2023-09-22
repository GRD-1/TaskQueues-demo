import * as Bull from 'bull';
import { QueueTaskArgs } from '../../../../../models/max-balance.model';
import { MOCKED_BLOCK } from './mocked-etherscan-service';
import { MOCKED_JOB } from './mocked-bull-job';

export const MOCKED_TASK_CONTENT: QueueTaskArgs = {
  taskNumber: 1,
  blockNumberHex: '0x4e3b7',
  sessionKey: 99999,
  content: MOCKED_BLOCK,
  terminateTask: true,
};

export const MOCKED_TASK = { data: JSON.stringify(MOCKED_TASK_CONTENT) };

interface QueueSettings {
  redis?: string;
  defaultJobOptions?: string;
  settings?: string;
  limiter?: string;
}

type BullQueueCallback = (job?: Bull.Job<any>, done?: Bull.DoneCallback) => Promise<void>;

export class MockedBullQueue {
  constructor(public name: string, settings: QueueSettings) {}

  async add<T, U>(name: string, task: T, opts: U): Promise<void> {
    return Promise.resolve();
  }

  async process(name: string, callback: BullQueueCallback): Promise<void> {
    await callback(MOCKED_JOB, jest.fn());
  }
}
