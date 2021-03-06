const keccak256 = require('js-sha3').keccak256;
const Government = artifacts.require('./Government.sol');
const Immigrant = artifacts.require('./Immigrant.sol');

contract('Government', function (accounts) {
  let government, immigrantContract, immigrantContractAddress;

  const [ governmentOwnerAccount, immigrantAccount ] = accounts;

  // Immigrant data exposed to government
  const occupation = 0;
  const age = 25;
  const income = 999;

  // Immigrant sensitive data (revealed at collection)
  const firstName = 'John';
  const lastName = 'Doe';
  const dateOfBirth = '01/01/1990';
  const correctPassword = '9999';

  function getBalance(address) {
    return new Promise((resolve, reject) => {
      web3.eth.getBalance(address, (error, result) => {
        if (error) {
          reject(error);
        }

        resolve(result);
      });
    });
  }

  async function getHash(firstName, lastName, dateOfBirth, password) {
    return await government.createHash(firstName, lastName, dateOfBirth, password);
  }

  beforeEach('create the bootstrapping test objects', async () => {
    government = await Government.new({ from: governmentOwnerAccount });

    const hashData = await getHash(firstName, lastName, dateOfBirth, correctPassword);

    const registerImmigrantTx = await government.register(occupation, age, income, hashData, { from: immigrantAccount });

    immigrantContractAddress = await government.immigrantRegistry(immigrantAccount);

    immigrantContract = Immigrant.at(immigrantContractAddress);
  });

  it('has an immigrant in the registry', async () => {
    assert.equal(await government.immigrantRegistry(immigrantAccount), immigrantContractAddress);
  });

  it('Makes a contribution', async () => {
    // Immigrant's first contribution (in ETH)
    const contribution = 10;

    const contributionTx = await immigrantContract.sendTransaction({
      from: immigrantAccount,
      value: contribution
    });

    const balance = await getBalance(immigrantContractAddress);

    assert.equal(balance, contribution, 'Immigrant\'s total contribution should be 10');
  });

  it('Invitation', async () => {
    const inviteTx = await government.invite(immigrantAccount);

    const status = await immigrantContract.status();

    assert.equal(status.toNumber(), 1, 'Immigrant\'s status should be 1 (invited)');
  });

  it('Collect an accepted immigrant contribution', async () => {
    // Do a contribution
    const contributionTx = await immigrantContract.sendTransaction({
      from: immigrantAccount,
      value: 5
    });

    // invite the immigrant
    const inviteTx = await government.invite(immigrantAccount, { from: governmentOwnerAccount });

    let error = false;
    try {
      console.log(await government.makeDecision(immigrantAccount, true, firstName, lastName, dateOfBirth, 'abc123'));
    } catch (err) {
      error = true;
    }
    assert.equal(error, true);

    assert.equal((await getBalance(immigrantContractAddress)).valueOf(), 5);
    const collectTx = await government.makeDecision(immigrantAccount, true, firstName, lastName, dateOfBirth, correctPassword);
    const balance = await getBalance(immigrantContractAddress);

    assert.equal(balance.toNumber(), 0, 'collectContribution should succeed when passing the correct info');
  });

  it('reject immigrant', async () => {
    // Do a contribution
    const contributionTx = await immigrantContract.sendTransaction({
      from: immigrantAccount,
      value: 5
    });

    // invite the immigrant
    const inviteTx = await government.invite(immigrantAccount, { from: governmentOwnerAccount });

    let error = false;
    try {
      const rejectTx = await government.makeDecision(immigrantAccount, false, firstName, lastName, dateOfBirth, 'wrongpass');
    } catch (e) {
      error = true;
    }
    assert.equal(error, true);

    assert.equal((await getBalance(immigrantContractAddress)).valueOf(), 5);
    // reject the immigrant
    const rejectTx = await government.makeDecision(immigrantAccount, false, firstName, lastName, dateOfBirth, correctPassword);

    // balance still 5
    assert.equal((await getBalance(immigrantContractAddress)).valueOf(), 5);
  });

  it('Let the immigrant withdraw his/her funds if they were not invited nor accepted', async () => {
    // Do a contribution
    let contributionTx = await immigrantContract.sendTransaction({
      from: immigrantAccount,
      value: 9999
    });

    // Another one
    contributionTx = await immigrantContract.sendTransaction({
      from: immigrantAccount,
      value: 345654
    });

    const balanceAfterContributions = await getBalance(immigrantAccount);

    // Withdraw ether
    const withdrawTx = await immigrantContract.withdrawETH(immigrantAccount, {
      from: immigrantAccount
    });

    // Updated balance
    const immigrantBalance = await getBalance(immigrantAccount);

    assert.notEqual(balanceAfterContributions.toNumber(), immigrantBalance.toNumber(), 'the withdrawer should have their wallet balance increased');

    const contractBalance = await getBalance(immigrantContractAddress);

    assert.equal(contractBalance.toNumber(), 0, 'withdrawETH should move all funds away from immigrant\'s contract');
  });

});
