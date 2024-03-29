import { MockedService } from './__mocks__/mocked-service';

describe('unit service.getMostChangedAccount', () => {
  let mockedService: MockedService;

  beforeEach(() => {
    mockedService = new MockedService();
  });

  it('when balances are positive', () => {
    const account1 = { address1: 100 };
    const account2 = { address2: 200 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account2);
  });

  it('when balances are negative', () => {
    const account1 = { address1: -100 };
    const account2 = { address2: -200 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account2);
  });

  it('when balances are a mix of positive and negative', () => {
    const account1 = { address1: 100 };
    const account2 = { address2: -200 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account2);
  });

  it('when one balance is zero', () => {
    const account1 = { address1: 0 };
    const account2 = { address2: 200 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account2);
  });

  it('when both balances are zero', () => {
    const account1 = { address1: 0 };
    const account2 = { address2: 0 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account1);
  });

  it('when one balance is NaN', () => {
    const account1 = { address1: NaN };
    const account2 = { address2: 200 };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account2);
  });

  it('when both balances are NaN', () => {
    const account1 = { address1: NaN };
    const account2 = { address2: NaN };
    const result = mockedService.getMostChangedAccount(account1, account2);
    expect(result).toEqual(account1);
  });

  it('should return an empty object when no accounts are provided', () => {
    const result = mockedService.getMostChangedAccount();
    expect(result).toEqual(undefined);
  });
});
