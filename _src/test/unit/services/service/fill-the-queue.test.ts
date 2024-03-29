import errorHandler from '../../../../errors/handler.error';
import { MockedService } from './__mocks__/mocked-service';
errorHandler.setErrorListener();

describe('unit service.fillTheQueue', () => {
  const mockedService = new MockedService();
  const fillTheQueue = mockedService.fillTheQueue;

  it('should return an array with a valid job', () => {
    const lastBlock = '0x100';
    const blocksAmount = 5;
    const queueFiller = jest.fn();
    const result = fillTheQueue(queueFiller, lastBlock, blocksAmount);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'download all blocks');
    expect(result[0]).toHaveProperty('task');
  });
});
