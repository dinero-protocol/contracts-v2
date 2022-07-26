import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { RewardDistributor, BTRFLYV2 } from '../typechain';
import { callAndReturnEvents, toBN, validateEvent } from './helpers';
import { BalanceTree } from '../lib/merkle';

describe('RewardDistributor', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrflyV2: BTRFLYV2;
  let rewardDistributor: RewardDistributor;

  let btrflyTree: any;
  let ethTree: any;
  let btrflyDistribution: any;
  let ethDistribution: any;
  let user1: string;
  let user2: string;

  const totalBtrflyReward: BigNumber = toBN(5e18);
  const totalEthReward: BigNumber = toBN(5e18);
  const userBtrflyReward1: BigNumber = toBN(1e18);
  const userEthReward1: BigNumber = toBN(1e18);
  const userBtrflyReward2: BigNumber = toBN(2e18);
  const userEthReward2: BigNumber = toBN(2e18);

  const arbitraryProof = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('ARBITRARY_PROOF')
  );

  before(async function () {
    ({ admin, notAdmin, btrflyV2, rewardDistributor } = this);

    // Populate mock rewards for RewardDistributor with BTRFLY and ETH
    // with admin acting as the multisig (and source of funds)
    await btrflyV2.transfer(rewardDistributor.address, totalBtrflyReward);
    await admin.sendTransaction({
      to: rewardDistributor.address,
      value: totalEthReward,
    });

    user1 = notAdmin.address;
    user2 = admin.address;
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      const multisig = await rewardDistributor.MULTISIG();

      // Should equal to admin (which we use for testing purposes)
      expect(multisig).to.equal(admin.address);
    });
  });

  describe('receive', function () {
    it('Should revert if caller is not Multisig', async function () {
      await expect(
        notAdmin.sendTransaction({
          to: rewardDistributor.address,
          value: 1,
        })
      ).to.be.revertedWith('Not MULTISIG');
    });
  });

  describe('updateRewardsMetadata', function () {
    before(async function () {
      btrflyTree = new BalanceTree([
        {
          account: user1,
          amount: userBtrflyReward1,
        },
        {
          account: user2,
          amount: userBtrflyReward2,
        },
      ]);
      ethTree = new BalanceTree([
        {
          account: user1,
          amount: userEthReward1,
        },
        {
          account: user2,
          amount: userEthReward2,
        },
      ]);

      btrflyDistribution = {
        token: btrflyV2.address,
        merkleRoot: btrflyTree.getHexRoot(),
        proof: arbitraryProof,
      };
      ethDistribution = {
        token: admin.address, // Multisig address indicates native token rewards
        merkleRoot: ethTree.getHexRoot(),
        proof: arbitraryProof,
      };
    });

    it('Should revert if called by a non-admin', async () => {
      await expect(
        rewardDistributor
          .connect(notAdmin)
          .updateRewardsMetadata([btrflyDistribution, ethDistribution])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should revert if distributions is an empty array', async () => {
      await expect(
        rewardDistributor.updateRewardsMetadata([])
      ).to.be.revertedWith('Invalid distributions');
    });

    it('Should update the rewards metadata', async () => {
      const events = await callAndReturnEvents(
        rewardDistributor.updateRewardsMetadata,
        [[btrflyDistribution, ethDistribution]]
      );
      const btrflyEvent = events[0];
      const ethEvent = events[1];

      expect(btrflyEvent.eventSignature)
        .to.equal(ethEvent.eventSignature)
        .to.equal('RewardMetadataUpdated(address,bytes32,bytes32,uint256)');
      expect(btrflyEvent.args.token).to.equal(btrflyV2.address);
      expect(btrflyEvent.args.merkleRoot).to.equal(btrflyTree.getHexRoot());
      expect(btrflyEvent.args.proof).to.equal(arbitraryProof);
      expect(btrflyEvent.args.updateCount).to.equal(ethers.BigNumber.from(1));
      expect(ethEvent.args.token).to.equal(admin.address);
      expect(ethEvent.args.merkleRoot).to.equal(ethTree.getHexRoot());
      expect(ethEvent.args.proof).to.equal(arbitraryProof);
      expect(ethEvent.args.updateCount).to.equal(ethers.BigNumber.from(1));
    });
  });

  describe('claim', function () {
    it('Should revert if claims is an empty array', async () => {
      await expect(rewardDistributor.claim([])).to.be.revertedWith(
        'Invalid claim'
      );
    });

    it('Should revert if claim is invalid', async function () {
      const invalidClaim = {
        token: btrflyV2.address,
        account: user1,
        amount: userBtrflyReward1.add(1), // Invalid amount
        merkleProof: btrflyTree.getProof(user1, userBtrflyReward1),
      };

      await expect(rewardDistributor.claim([invalidClaim])).to.be.revertedWith(
        'Invalid proof'
      );
    });

    it('Should allow eligible users to claim', async () => {
      const userBtrflyClaim1 = {
        token: btrflyV2.address,
        account: user1,
        amount: userBtrflyReward1,
        merkleProof: btrflyTree.getProof(user1, userBtrflyReward1),
      };
      const userBtrflyClaim2 = {
        token: btrflyV2.address,
        account: user2,
        amount: userBtrflyReward2,
        merkleProof: btrflyTree.getProof(user2, userBtrflyReward2),
      };

      const userEthClaim1 = {
        token: admin.address,
        account: user1,
        amount: userEthReward1,
        merkleProof: ethTree.getProof(user1, userEthReward1),
      };
      const userEthClaim2 = {
        token: admin.address,
        account: user2,
        amount: userEthReward2,
        merkleProof: ethTree.getProof(user2, userEthReward2),
      };

      const events = await callAndReturnEvents(rewardDistributor.claim, [
        [userBtrflyClaim1, userBtrflyClaim2, userEthClaim1, userEthClaim2],
      ]);

      const userBtrflyClaimEvent1 = events[1];
      const userBtrflyClaimEvent2 = events[3];
      const userEthClaimEvent1 = events[4];
      const userEthClaimEvent2 = events[5];

      const userBtrflyClaimed1 = await rewardDistributor.claimed(
        btrflyV2.address,
        user1
      );
      const userBtrflyClaimed2 = await rewardDistributor.claimed(
        btrflyV2.address,
        user2
      );
      const userEthClaimed1 = await rewardDistributor.claimed(
        admin.address,
        user1
      );
      const userEthClaimed2 = await rewardDistributor.claimed(
        admin.address,
        user2
      );

      validateEvent(
        userBtrflyClaimEvent1,
        'RewardClaimed(address,address,uint256,uint256)',
        {
          token: btrflyV2.address,
          account: user1,
          amount: userBtrflyReward1,
          updateCount: 1,
        }
      );
      validateEvent(
        userBtrflyClaimEvent2,
        'RewardClaimed(address,address,uint256,uint256)',
        {
          token: btrflyV2.address,
          account: user2,
          amount: userBtrflyReward2,
          updateCount: 1,
        }
      );
      validateEvent(
        userEthClaimEvent1,
        'RewardClaimed(address,address,uint256,uint256)',
        {
          token: admin.address,
          account: user1,
          amount: userEthReward1,
          updateCount: 1,
        }
      );
      validateEvent(
        userEthClaimEvent2,
        'RewardClaimed(address,address,uint256,uint256)',
        {
          token: admin.address,
          account: user2,
          amount: userEthReward2,
          updateCount: 1,
        }
      );

      expect(userBtrflyClaimed1).to.equal(userBtrflyReward1);
      expect(userBtrflyClaimed2).to.equal(userBtrflyReward2);
      expect(userEthClaimed1).to.equal(userEthReward1);
      expect(userEthClaimed2).to.equal(userEthReward2);
    });
  });
});
