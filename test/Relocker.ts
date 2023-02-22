import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  impersonateAddressAndReturnSigner,
  validateEvent,
} from './helpers';
import { ethers } from 'hardhat';
import {
  RLBTRFLY,
  BTRFLYV2,
  RewardDistributor,
  Relocker,
  Relocker__factory,
} from '../typechain';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { BalanceTree } from '../lib/merkle';
import fetch from 'node-fetch';

type Claims = {
  token: string;
  account: string;
  amount: string;
  merkleProof: string[];
}[];

describe('Relocker', () => {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let rlBtrfly: RLBTRFLY;
  let btrfly: BTRFLYV2;
  let rewardDistributor: RewardDistributor;
  let relocker: Relocker;
  let userBtrflyClaim: Claims;
  let btrflyAmount: string;

  before(async function () {
    ({ admin } = this);

    rlBtrfly = (await ethers.getContractAt(
      'RLBTRFLY',
      '0x742B70151cd3Bc7ab598aAFF1d54B90c3ebC6027'
    )) as RLBTRFLY;

    btrfly = (await ethers.getContractAt(
      'BTRFLYV2',
      '0xc55126051B22eBb829D00368f4B12Bde432de5Da'
    )) as BTRFLYV2;

    rewardDistributor = (await ethers.getContractAt(
      'RewardDistributor',
      '0xd7807E5752B368A6a64b76828Aaff0750522a76E'
    )) as RewardDistributor;
    
    //get latest distribution
    const response = await fetch('https://raw.githubusercontent.com/redacted-cartel/distributions/master/protocol-v2/latest/btrfly.json');
    const latestDistribution = await response.json();

    //get merkle tree from latest distribution
    const btrflyTree = new BalanceTree(latestDistribution);

    //user as the first account in latestDistribution with no claimed rewards
    for (const item of latestDistribution) {
      if ((await rewardDistributor.claimed(btrfly.address, item.account)).eq(0)) {
        user = await impersonateAddressAndReturnSigner(
          admin,
          item.account
        );
        btrflyAmount = item.amount;
        break;
      }
    }

    //get user's merkle proof
    userBtrflyClaim = [{
      token: btrfly.address,
      account: user.address,
      amount: btrflyAmount,
      merkleProof: btrflyTree.getProof(user.address, BigNumber.from(btrflyAmount)),
    }];
  });

  beforeEach(async function () {
    const relockerFactory = (await ethers.getContractFactory(
      'Relocker'
    )) as Relocker__factory;

    relocker = await relockerFactory.deploy(
      btrfly.address,
      rlBtrfly.address,
      rewardDistributor.address
    );
  });

  describe('constructor', () => {
    it('Should set up contract state', async () => {
      const btrflyAddress = await relocker.btrfly();
      const rlBtrflyAddress = await relocker.rlBtrfly();
      const rewardDistributorAddress = await relocker.rewardDistributor();

      expect(btrflyAddress).to.equal(btrfly.address);
      expect(rlBtrflyAddress).to.equal(rlBtrfly.address);
      expect(rewardDistributorAddress).to.equal(rewardDistributor.address);
    });
  });

  describe('claimAndLock', () => {
    it('should revert on zero amount', async () => {
      const amount = 0;

      await expect(relocker.claimAndLock(userBtrflyClaim, amount)).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('should claim and lock btrfly', async () => {
      const userRLBalanceBefore = await rlBtrfly.lockedBalanceOf(user.address);

      const expectedUserRLBalanceAfter = userRLBalanceBefore.add(btrflyAmount);

      await btrfly.connect(user).approve(relocker.address, btrflyAmount);

      const relockEvent = await callAndReturnEvent(
        relocker.connect(user).claimAndLock,
        [userBtrflyClaim, btrflyAmount]
      );

      validateEvent(relockEvent, 'Relock(address,uint256)', {
        account: user.address,
        amount: btrflyAmount,
      });

      const userRLBalanceAfter = await rlBtrfly.lockedBalanceOf(user.address);
      const userRLBalanceIncrease = userRLBalanceAfter.sub(userRLBalanceBefore);

      expect(userRLBalanceAfter).to.equal(expectedUserRLBalanceAfter);
      expect(userRLBalanceIncrease).to.equal(btrflyAmount);
    });
  });
});
