import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  getPermitSignature,
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

type Distribution = {
  token: string;
  merkleRoot: string;
  proof: string;
};

describe('Relocker', function () {
  let admin: SignerWithAddress;
  let actualUser: SignerWithAddress;
  let mockUser: SignerWithAddress;
  let rlBtrfly: RLBTRFLY;
  let btrfly: BTRFLYV2;
  let rewardDistributor: RewardDistributor;
  let btrflyDistribution: Distribution;
  let relocker: Relocker;
  let userBtrflyClaim: Claims;
  let mockUserBtrflyClaim: Claims;
  let btrflyAmount: string;
  let snapshotId: number;

  const arbitraryProof = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('ARBITRARY_PROOF')
  );

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

    //actualUser as the first account in latestDistribution with no claimed rewards
    for (const item of latestDistribution) {
      if ((await rewardDistributor.claimed(btrfly.address, item.account)).eq(0)) {
        actualUser = await impersonateAddressAndReturnSigner(
          admin,
          item.account
        );
        btrflyAmount = item.amount;
        break;
      }
    }

    [mockUser] = await ethers.getSigners();

    //append actualUser account to latest distribution
    latestDistribution.push({
      account: mockUser.address,
      amount: btrflyAmount,
    });

    //get merkle tree from latest distribution
    const btrflyTree = new BalanceTree(latestDistribution);

    //impersonate reward distributor owner
    const rewardDistributorOwner = await impersonateAddressAndReturnSigner(
      admin,
      await rewardDistributor.owner()
    );

    btrflyDistribution = {
      token: btrfly.address,
      merkleRoot: btrflyTree.getHexRoot(),
      proof: arbitraryProof,
    };

    //update reward distributor with latest distribution
    await rewardDistributor
      .connect(rewardDistributorOwner)
      .updateRewardsMetadata([btrflyDistribution]);

    //get actualUser's merkle proof
    userBtrflyClaim = [{
      token: btrfly.address,
      account: actualUser.address,
      amount: btrflyAmount,
      merkleProof: btrflyTree.getProof(actualUser.address, BigNumber.from(btrflyAmount)),
    }];

    mockUserBtrflyClaim = [{
      token: btrfly.address,
      account: mockUser.address,
      amount: btrflyAmount,
      merkleProof: btrflyTree.getProof(mockUser.address, BigNumber.from(btrflyAmount)),
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

    snapshotId = snapshotId ?? await ethers.provider.send('evm_snapshot', []);
  });

  describe('constructor', function () {
    it('Should set up contract state', async () => {
      const btrflyAddress = await relocker.btrfly();
      const rlBtrflyAddress = await relocker.rlBtrfly();
      const rewardDistributorAddress = await relocker.rewardDistributor();

      expect(btrflyAddress).to.equal(btrfly.address);
      expect(rlBtrflyAddress).to.equal(rlBtrfly.address);
      expect(rewardDistributorAddress).to.equal(rewardDistributor.address);
    });
  });

  describe('claimAndLock', function () {
    it('should revert on zero amount', async () => {
      const amount = 0;
      await expect(relocker.claimAndLock(userBtrflyClaim, amount, "0x")).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('should revert on invalid permit signature', async () => {
      //invalid deadline
      const { v, r, s } = await getPermitSignature(
        mockUser,
        btrfly,
        relocker.address,
        BigNumber.from(btrflyAmount),
        ethers.constants.Zero
      );

      const permitParams = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint8", "bytes32", "bytes32"],
        [mockUser.address, relocker.address, btrflyAmount, ethers.constants.Zero, v, r, s]
      );

      await expect(relocker.claimAndLock(mockUserBtrflyClaim, btrflyAmount, permitParams)).to.be.revertedWith("PermitFailed()");
    });

    it('should claim and lock btrfly using permit', async () => {
      const userRLBalanceBefore = await rlBtrfly.lockedBalanceOf(mockUser.address);
      const expectedUserRLBalanceAfter = userRLBalanceBefore.add(btrflyAmount);

      const { v, r, s } = await getPermitSignature(
        mockUser,
        btrfly,
        relocker.address,
        BigNumber.from(btrflyAmount),
        ethers.constants.MaxUint256
      )

      const permitParams = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint8", "bytes32", "bytes32"],
        [mockUser.address, relocker.address, btrflyAmount, ethers.constants.MaxUint256, v, r, s]
      );

      const relockEvent = await callAndReturnEvent(
        relocker.connect(mockUser).claimAndLock,
        [mockUserBtrflyClaim, btrflyAmount, permitParams]
      );

      validateEvent(relockEvent, 'Relock(address,uint256)', {
        account: mockUser.address,
        amount: btrflyAmount,
      });

      const userRLBalanceAfter = await rlBtrfly.lockedBalanceOf(mockUser.address);
      const userRLBalanceIncrease = userRLBalanceAfter.sub(userRLBalanceBefore);
      expect(userRLBalanceAfter).to.equal(expectedUserRLBalanceAfter);
      expect(userRLBalanceIncrease).to.equal(btrflyAmount);

      await ethers.provider.send('evm_revert', [snapshotId]);
    });

    it('should claim and lock btrfly using approve', async () => {
      const userRLBalanceBefore = await rlBtrfly.lockedBalanceOf(actualUser.address);
      const expectedUserRLBalanceAfter = userRLBalanceBefore.add(btrflyAmount);
      await btrfly.connect(actualUser).approve(relocker.address, btrflyAmount);

      const relockEvent = await callAndReturnEvent(
        relocker.connect(actualUser).claimAndLock,
        [userBtrflyClaim, btrflyAmount, "0x"],
      );

      validateEvent(relockEvent, 'Relock(address,uint256)', {
        account: actualUser.address,
        amount: btrflyAmount,
      });

      const userRLBalanceAfter = await rlBtrfly.lockedBalanceOf(actualUser.address);
      const userRLBalanceIncrease = userRLBalanceAfter.sub(userRLBalanceBefore);
      expect(userRLBalanceAfter).to.equal(expectedUserRLBalanceAfter);
      expect(userRLBalanceIncrease).to.equal(btrflyAmount);

      await ethers.provider.send('evm_revert', [snapshotId]);
    });
  });
});
