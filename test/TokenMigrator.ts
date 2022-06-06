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
import { BigNumber } from 'ethers';

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

  describe('migrate', function () {
    let caller: string;
    let wxAmount: BigNumber;
    let xAmount: BigNumber;
    let v1Amount: BigNumber;
    let recipient: string;

    before(async function () {
      caller = admin.address;
      wxAmount = toBN(1e18);
      xAmount = toBN(1e9);
      v1Amount = toBN(1e9);
      recipient = admin.address;

      await wxBtrfly.approve(
        tokenMigrator.address,
        await wxBtrfly.balanceOf(caller)
      );
      await xBtrfly.approve(
        tokenMigrator.address,
        await xBtrfly.balanceOf(caller)
      );
      await btrfly.approve(
        tokenMigrator.address,
        await btrfly.balanceOf(caller)
      );
    });

    describe('Should revert if recipient is zero address', async function () {
      const invalidRecipient = zeroAddress;
      const lock = false;

      await expect(
        tokenMigrator.migrate(wxAmount, xAmount, v1Amount, invalidRecipient, lock)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('Should migrate different BTRFLY tokens to BTRFLYV2', async function () {
      // 50/50 chance of lock being false or true
      const lock = Math.random() < 0.5 ? false : true;

      const wxBtrflyBalanceBefore = await wxBtrfly.balanceOf(caller);
      const xBtrflyBalanceBefore = await xBtrfly.balanceOf(caller);
      const btrflyBalanceBefore = await btrfly.balanceOf(caller);
      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(recipient);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(recipient);
      const [migrateEvent] = await callAndReturnEvents(tokenMigrator.migrate, [
        wxAmount,
        xAmount,
        v1Amount,
        recipient,
        lock,
      ]);
      const wxBtrflyBalanceAfter = await wxBtrfly.balanceOf(caller);
      const xBtrflyBalanceAfter = await xBtrfly.balanceOf(caller);
      const btrflyBalanceAfter = await btrfly.balanceOf(caller);
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(recipient);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(recipient);
      const wxBtrflyAmountFromWXBtrfly = wxAmount;
      const wxBtrflyAmountFromXBtrfly = await wxBtrfly.wBTRFLYValue(xAmount);
      const wxBtrflyAmountFromBtrfly = await wxBtrfly.wBTRFLYValue(v1Amount);
      const expectedBtrflyV2MintAmount = wxBtrflyAmountFromWXBtrfly
        .add(wxBtrflyAmountFromXBtrfly)
        .add(wxBtrflyAmountFromBtrfly);

      expect(wxBtrflyBalanceBefore.sub(wxBtrflyBalanceAfter)).to.equal(
        wxAmount
      );
      expect(xBtrflyBalanceBefore.sub(xBtrflyBalanceAfter)).to.equal(xAmount);
      expect(btrflyBalanceBefore.sub(btrflyBalanceAfter)).to.equal(v1Amount);

      if (!lock) {
        expect(btrflyV2BalanceAfter.sub(btrflyV2BalanceBefore)).to.equal(
          expectedBtrflyV2MintAmount
        );
        expect(lockedBalanceAfter.sub(lockedBalanceBefore)).to.equal(0);
      } else {
        expect(btrflyV2BalanceAfter.sub(btrflyV2BalanceBefore)).to.equal(0);
        expect(lockedBalanceAfter.sub(lockedBalanceBefore)).to.equal(
          expectedBtrflyV2MintAmount
        );
      }

      validateEvent(
        migrateEvent,
        'Migrate(uint256,uint256,uint256,address,bool,address)',
        {
          wxAmount,
          xAmount,
          v1Amount,
          recipient,
          lock,
          caller,
        }
      );
    });
  });
});
