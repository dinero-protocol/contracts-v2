import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  ClaimData,
  ClaimMetaData,
  getClaimData,
  impersonateAddressAndReturnSigner,
  toBN,
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

describe('Relocker', () => {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let rlBtrfly: RLBTRFLY;
  let btrfly: BTRFLYV2;
  let rewardDistributor: RewardDistributor;
  let relocker: Relocker;
  let claimData: ClaimData[];
  let claims: ClaimMetaData[];
  let btrflyClaimData: ClaimData[];
  let btrflyAmount: BigNumber;

  before(async function () {
    ({ admin } = this);

    user = await impersonateAddressAndReturnSigner(
      admin,
      '0xe7ad7d90639a565fe3a6f68a41ad0b095f631f39'
    );

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

    const relockerFactory = (await ethers.getContractFactory(
      'Relocker'
    )) as Relocker__factory;

    relocker = await relockerFactory.deploy(
      btrfly.address,
      rlBtrfly.address,
      rewardDistributor.address
    );

    claimData = await getClaimData(user.address);
    claims = claimData.map((data) => data.claimMetadata);

    // isolate btrfly claim data
    btrflyClaimData = claimData.filter(
      (data) => data.token.toLowerCase() === btrfly.address.toLowerCase()
    );

    // get total number of btrfly claimable by user
    btrflyAmount = btrflyClaimData.reduce(
      (prev, cur) => prev.add(BigNumber.from(cur.claimable)),
      BigNumber.from(0)
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

      await expect(relocker.claimAndLock(claims, amount)).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('should revert if amount is greater than claimable amount', async () => {
      const greaterThanAmount = btrflyAmount.add(toBN(1));

      await expect(
        relocker.claimAndLock(claims, greaterThanAmount)
      ).to.revertedWith(
        'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
      );
    });

    it('should claim and lock if amount is less than claimable', async () => {
      const secondUser = await impersonateAddressAndReturnSigner(
        admin,
        '0xb5e84d6d97021124F29c4947cd05E57cd24C8249'
      );

      const secondUserClaimData = await getClaimData(secondUser.address);
      const secondUserBtrflyClaimData = secondUserClaimData.filter(
        (data) => data.token.toLowerCase() === btrfly.address.toLowerCase()
      );
      const btrflyAmount = secondUserBtrflyClaimData.reduce(
        (prev, cur) => prev.add(BigNumber.from(cur.claimable)),
        BigNumber.from(0)
      );
      const secondUsersClaims = secondUserBtrflyClaimData.map(
        (data) => data.claimMetadata
      );

      const lessBtrflyAmount = btrflyAmount.sub(toBN(1));

      const secondUserRLBalanceBefore = await rlBtrfly.lockedBalanceOf(
        secondUser.address
      );
      const expectedSecondUserRLBalanceAfter =
        secondUserRLBalanceBefore.add(lessBtrflyAmount);

      await btrfly
        .connect(secondUser)
        .approve(relocker.address, lessBtrflyAmount);

      await relocker
        .connect(secondUser)
        .claimAndLock(secondUsersClaims, lessBtrflyAmount);

      const secondUserRLBalanceAfter = await rlBtrfly.lockedBalanceOf(
        secondUser.address
      );
      const secondUserRLBalanceIncrease = secondUserRLBalanceAfter.sub(
        secondUserRLBalanceBefore
      );

      expect(secondUserRLBalanceAfter).to.equal(
        expectedSecondUserRLBalanceAfter
      );
      expect(secondUserRLBalanceIncrease).to.equal(lessBtrflyAmount);
    });

    it('should claim and lock btrfly', async () => {
      const userRLBalanceBefore = await rlBtrfly.lockedBalanceOf(user.address);

      const expectedUserRLBalanceAfter = userRLBalanceBefore.add(btrflyAmount);

      await btrfly.connect(user).approve(relocker.address, btrflyAmount);

      const relockEvent = await callAndReturnEvent(
        relocker.connect(user).claimAndLock,
        [claims, btrflyAmount]
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
