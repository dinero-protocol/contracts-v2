import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  RLBTRFLY,
  BTRFLY,
  IERC20,
  WxBTRFLY,
  IStakingHelper,
  TokenMigrator,
  MockMariposa,
  BTRFLYV2,
  IStaking,
} from '../typechain';
import {
  toBN,
  impersonateAddressAndReturnSigner,
  callAndReturnEvents,
  validateEvent,
} from './helpers';

describe('Token Migrator', function () {
  let admin: SignerWithAddress;
  let dao: SignerWithAddress;
  let zeroAddress: string;
  let redactedMultisig: string;
  let holder: SignerWithAddress;
  let btrfly: BTRFLY;
  let btrflyV2: BTRFLYV2;
  let xBtrfly: IERC20;
  let wxBtrfly: WxBTRFLY;
  let redactedStaking: IStaking;
  let redactedStakingHelper: IStakingHelper;
  let mariposa: MockMariposa;
  let rlBtrfly: RLBTRFLY;
  let tokenMigrator: TokenMigrator;

  before(async function () {
    ({
      zeroAddress,
      redactedMultisig,
      btrfly,
      btrflyV2,
      xBtrfly,
      wxBtrfly,
      redactedStaking,
      redactedStakingHelper,
    } = this);

    [admin, holder] = await ethers.getSigners();
    mariposa = (await (
      await ethers.getContractFactory('MockMariposa')
    ).deploy(btrflyV2.address)) as MockMariposa;
    rlBtrfly = (await (
      await ethers.getContractFactory('RLBTRFLY')
    ).deploy(btrflyV2.address)) as RLBTRFLY;
    tokenMigrator = (await (
      await ethers.getContractFactory('TokenMigrator')
    ).deploy(
      wxBtrfly.address,
      xBtrfly.address,
      btrflyV2.address,
      btrfly.address,
      mariposa.address,
      redactedStaking.address,
      rlBtrfly.address
    )) as TokenMigrator;

    // Use Redacted multisig as signer
    dao = await impersonateAddressAndReturnSigner(admin, redactedMultisig);

    await btrfly.connect(dao).setVault(admin.address);
    await btrflyV2.grantRole(await btrflyV2.MINTER_ROLE(), mariposa.address);

    const otherBtrflyAmount = toBN(10e9);

    // Mint BTRFLY and split between wxBTRFLY and xBTRFLY
    await btrfly.mint(admin.address, toBN(30e9));
    await btrfly.approve(wxBtrfly.address, otherBtrflyAmount);
    await btrfly.approve(redactedStaking.address, otherBtrflyAmount);
    await wxBtrfly.wrapFromBTRFLY(otherBtrflyAmount);
    await redactedStaking.stake(otherBtrflyAmount, admin.address);
    await redactedStaking.claim(admin.address);

    // Approve contracts to spend the maximum amount for each token
    await btrfly
      .connect(holder)
      .approve(wxBtrfly.address, ethers.constants.MaxUint256);
    await btrfly
      .connect(holder)
      .approve(redactedStakingHelper.address, ethers.constants.MaxUint256);
    await btrfly
      .connect(holder)
      .approve(tokenMigrator.address, ethers.constants.MaxUint256);
    await xBtrfly
      .connect(holder)
      .approve(tokenMigrator.address, ethers.constants.MaxUint256);
    await wxBtrfly
      .connect(holder)
      .approve(tokenMigrator.address, ethers.constants.MaxUint256);
  });

  describe('constructor', function () {
    it('Initialises contract state correctly', async function () {
      const wxBtrflyAddress = await tokenMigrator.wxBtrfly();
      const xBtrflyAddress = await tokenMigrator.xBtrfly();
      const btrflyV2Address = await tokenMigrator.btrflyV2();
      const btrflyAddress = await tokenMigrator.btrfly();
      const mariposaAddress = await tokenMigrator.mariposa();
      const stakingAddress = await tokenMigrator.staking();
      const rlBtrflyAddress = await tokenMigrator.rlBtrfly();

      expect(wxBtrflyAddress).to.equal(wxBtrfly.address);
      expect(xBtrflyAddress).to.equal(xBtrfly.address);
      expect(btrflyV2Address).to.equal(btrflyV2.address);
      expect(btrflyAddress).to.equal(btrfly.address);
      expect(mariposaAddress).to.equal(mariposa.address);
      expect(stakingAddress).to.equal(redactedStaking.address);
      expect(rlBtrflyAddress).to.equal(rlBtrfly.address);
    });
  });

  describe('migrateWxBtrfly', function () {
    it('Should revert if amount is zero', async function () {
      const invalidAmount = 0;
      const recipient = admin.address;
      const lock = false;

      await expect(
        tokenMigrator.migrateWxBtrfly(invalidAmount, recipient, lock)
      ).to.be.revertedWith('ZeroAmount()');
    });

    it('Should revert if address is zero address', async function () {
      const amount = toBN(1e18);
      const invalidRecipient = zeroAddress;
      const lock = false;

      await expect(
        tokenMigrator.migrateWxBtrfly(amount, invalidRecipient, lock)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('Should migrate wxBTRFLY to BTRFLYV2 without locking', async function () {
      const caller = admin.address;
      const amount = toBN(1e18);
      const recipient = admin.address;
      const lock = false;
      const wxBtrflyBalanceBefore = await wxBtrfly.balanceOf(caller);
      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(recipient);

      await wxBtrfly.approve(tokenMigrator.address, amount);

      const [migrateEvent] = await callAndReturnEvents(
        tokenMigrator.migrateWxBtrfly,
        [amount, recipient, lock]
      );
      const wxBtrflyBalanceAfter = await wxBtrfly.balanceOf(caller);
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(recipient);
      const unwrappedAmount = await wxBtrfly.xBTRFLYValue(amount);

      expect(wxBtrflyBalanceBefore.sub(wxBtrflyBalanceAfter)).to.equal(amount);
      expect(btrflyV2BalanceAfter.sub(btrflyV2BalanceBefore)).to.equal(amount);

      validateEvent(migrateEvent, 'Migrate(address,address,bool,uint256)', {
        to: recipient,
        from: caller,
        rl: lock,
        amount: unwrappedAmount,
      });
    });

    it('Should migrate wxBTRFLY to BTRFLYV2 with locking', async function () {
      const caller = admin.address;
      const amount = toBN(1e18);
      const recipient = admin.address;
      const lock = true;
      const wxBtrflyBalanceBefore = await wxBtrfly.balanceOf(caller);
      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(recipient);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(recipient);

      await wxBtrfly.approve(tokenMigrator.address, amount);

      const [migrateEvent] = await callAndReturnEvents(
        tokenMigrator.migrateWxBtrfly,
        [amount, recipient, lock]
      );
      const wxBtrflyBalanceAfter = await wxBtrfly.balanceOf(caller);
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(recipient);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(recipient);
      const unwrappedAmount = await wxBtrfly.xBTRFLYValue(amount);

      expect(wxBtrflyBalanceBefore.sub(wxBtrflyBalanceAfter)).to.equal(amount);
      expect(btrflyV2BalanceAfter).to.equal(btrflyV2BalanceBefore);
      expect(lockedBalanceAfter.sub(lockedBalanceBefore)).to.equal(amount);

      validateEvent(migrateEvent, 'Migrate(address,address,bool,uint256)', {
        to: recipient,
        from: caller,
        rl: lock,
        amount: unwrappedAmount,
      });
    });
  });

  describe('migrateXBtrfly', function () {
    it('Should revert if amount is zero', async function () {
      const invalidAmount = 0;
      const recipient = admin.address;
      const lock = false;

      await expect(
        tokenMigrator.migrateXBtrfly(invalidAmount, recipient, lock)
      ).to.be.revertedWith('ZeroAmount()');
    });

    it('Should revert if address is zero address', async function () {
      const amount = toBN(1e9);
      const invalidRecipient = zeroAddress;
      const lock = false;

      await expect(
        tokenMigrator.migrateXBtrfly(amount, invalidRecipient, lock)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('Should migrate xBTRFLY to BTRFLYV2 without locking', async function () {
      const caller = admin.address;
      const amount = toBN(1e9);
      const recipient = admin.address;
      const lock = false;
      const xBtrflyBalanceBefore = await xBtrfly.balanceOf(caller);
      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(recipient);

      await xBtrfly.approve(tokenMigrator.address, amount);

      const [migrateEvent] = await callAndReturnEvents(
        tokenMigrator.migrateXBtrfly,
        [amount, recipient, lock]
      );
      const xBtrflyBalanceAfter = await xBtrfly.balanceOf(caller);
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(recipient);
      const wxBtrflyAmount = await wxBtrfly.wBTRFLYValue(amount);

      expect(xBtrflyBalanceBefore.sub(xBtrflyBalanceAfter)).to.equal(amount);
      expect(btrflyV2BalanceAfter.sub(btrflyV2BalanceBefore)).to.equal(
        wxBtrflyAmount
      );

      validateEvent(migrateEvent, 'Migrate(address,address,bool,uint256)', {
        to: recipient,
        from: caller,
        rl: lock,
        amount,
      });
    });

    it('Should migrate xBTRFLY to BTRFLYV2 with locking', async function () {
      const caller = admin.address;
      const amount = toBN(1e9);
      const recipient = admin.address;
      const lock = true;
      const xBtrflyBalanceBefore = await xBtrfly.balanceOf(caller);
      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(recipient);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(recipient);

      await xBtrfly.approve(tokenMigrator.address, amount);

      const [migrateEvent] = await callAndReturnEvents(
        tokenMigrator.migrateXBtrfly,
        [amount, recipient, lock]
      );
      const xBtrflyBalanceAfter = await xBtrfly.balanceOf(caller);
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(recipient);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(recipient);
      const wxBtrflyAmount = await wxBtrfly.wBTRFLYValue(amount);

      expect(xBtrflyBalanceBefore.sub(xBtrflyBalanceAfter)).to.equal(amount);
      expect(btrflyV2BalanceAfter).to.equal(btrflyV2BalanceBefore);
      expect(lockedBalanceAfter.sub(lockedBalanceBefore)).to.equal(
        wxBtrflyAmount
      );

      validateEvent(migrateEvent, 'Migrate(address,address,bool,uint256)', {
        to: recipient,
        from: caller,
        rl: lock,
        amount,
      });
    });
  });
});
