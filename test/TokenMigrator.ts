import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  RLBTRFLY,
  BTRFLY,
  IERC20,
  IWXBTRFLY,
  IStakingHelper,
  TokenMigrator,
  MockMariposa,
  BTRFLYV2,
  IStaking,
} from '../typechain';
import {
  toBN,
  impersonateAddressAndReturnSigner,
  callAndReturnEvent,
  validateEvent,
} from './helpers';

describe('Token Migrator', function () {
  let admin: SignerWithAddress;
  let dao: SignerWithAddress;
  let redactedMultisig: string;
  let holder: SignerWithAddress;
  let receiver: SignerWithAddress;
  let btrfly: BTRFLY;
  let btrflyV2: BTRFLYV2;
  let xBtrfly: IERC20;
  let wxBtrfly: IWXBTRFLY;
  let redactedStaking: IStaking;
  let redactedStakingHelper: IStakingHelper;
  let mariposa: MockMariposa;
  let rlBtrfly: RLBTRFLY;
  let tokenMigrator: TokenMigrator;

  beforeEach(async function () {
    ({
      redactedMultisig,
      btrfly,
      btrflyV2,
      xBtrfly,
      wxBtrfly,
      redactedStaking,
      redactedStakingHelper,
    } = this);

    [admin, holder, receiver] = await ethers.getSigners();
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

  describe('Handling of Invalid Parameters', function () {
    it('Reverts with ZeroAddress() when recipient is entered as 0x00...0', async function () {
      await expect(
        tokenMigrator.migrate(
          ethers.utils.parseUnits('10', 'ether'),
          ethers.utils.parseUnits('10', 'gwei'),
          ethers.utils.parseUnits('10', 'gwei'),
          ethers.constants.AddressZero,
          false
        )
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('Reverts with ZeroAmount() when all amounts to migrate are 0', async function () {
      await expect(
        tokenMigrator.migrate('0', '0', '0', holder.address, false)
      ).to.be.revertedWith('ZeroAmount()');
    });
  });

  describe('WXBTRFLY --> BTRFLYV2', function () {
    it('Returns the correct migrated value', async function () {
      const holderAddress = holder.address;

      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('1000', 'gwei'));

      const balanceWx = await wxBtrfly.balanceOf(await holder.getAddress());

      const migrateEvent = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [balanceWx, '0', '0', holderAddress, false]
      );

      await validateEvent(
        migrateEvent,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: balanceWx,
        }
      );
    });

    it('Reverts when user balance is insufficient', async function () {
      await expect(
        tokenMigrator
          .connect(holder)
          .migrate(
            ethers.utils.parseUnits('1', 'ether'),
            '0',
            '0',
            holder.address,
            false
          )
      ).to.be.revertedWith('');
    });

    it("Decrements user's WXBTRFLY balance", async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('1000', 'gwei'));
      const balanceWx = await wxBtrfly.balanceOf(await holder.getAddress());

      await tokenMigrator
        .connect(holder)
        .migrate(balanceWx, '0', '0', holderAddress, false);

      expect(await wxBtrfly.balanceOf(holderAddress)).to.equal(toBN(0));
    });
  });

  describe('XBTRFLY --> BTRFLYV2', function () {
    it('Returns the correct migrated value', async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('1000', 'gwei'));
      const valueWx = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      const migrateEvent = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          '0',
          ethers.utils.parseUnits('1000', 'gwei'),
          '0',
          holderAddress,
          false,
        ]
      );

      await validateEvent(
        migrateEvent,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWx,
        }
      );
    });

    it('Reverts when user balance is insufficient', async function () {
      await expect(
        tokenMigrator
          .connect(holder)
          .migrate(
            '0',
            ethers.utils.parseUnits('1', 'gwei'),
            '0',
            holder.address,
            false
          )
      ).to.be.revertedWith('');
    });

    it("Decrements user's XBTRFLY balance", async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('1000', 'gwei'));

      await tokenMigrator
        .connect(holder)
        .migrate(
          '0',
          ethers.utils.parseUnits('1000', 'gwei'),
          '0',
          holder.address,
          false
        );

      expect(await xBtrfly.balanceOf(holderAddress)).to.equal(toBN(0));
    });
  });

  describe('BTRFLYV1 --> BTRFLYV2', async function () {
    it('Returns the correct migrated value', async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));
      const valueWx = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      const migrateEvent = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          '0',
          '0',
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          false,
        ]
      );

      await validateEvent(
        migrateEvent,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWx,
        }
      );
    });

    it('Reverts when user balance is insufficient', async function () {
      await expect(
        tokenMigrator
          .connect(receiver)
          .migrate(
            '0',
            '0',
            ethers.utils.parseUnits('1', 'gwei'),
            holder.address,
            false
          )
      ).to.be.revertedWith('');
    });

    it("Decrements user's BTRFLYV1 balance", async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('1000', 'gwei'));

      await tokenMigrator
        .connect(holder)
        .migrate(
          '0',
          '0',
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          false
        );

      const holderV1BalancePost = await btrfly.balanceOf(holderAddress);

      expect(holderV1BalancePost).to.equal(toBN(0));
    });
  });

  describe('Multiple Token Migration', async function () {
    it('Returns correct value for all multiple token migration permutations', async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('9000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('3000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('3000', 'gwei'));
      const valueWxBase = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      const migrateEvent111 = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          false,
        ]
      );

      const migrateEvent110 = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          0,
          holderAddress,
          false,
        ]
      );

      const migrateEvent101 = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          0,
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          false,
        ]
      );

      const migrateEvent011 = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          0,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          false,
        ]
      );

      await validateEvent(
        migrateEvent111,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWxBase.mul(toBN(3)),
        }
      );

      await validateEvent(
        migrateEvent110,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWxBase.mul(toBN(2)),
        }
      );

      await validateEvent(
        migrateEvent101,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWxBase.mul(toBN(2)),
        }
      );

      await validateEvent(
        migrateEvent011,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: false,
          value: valueWxBase.mul(toBN(2)),
        }
      );
    });
  });

  describe('Minting BTRFLYV2', function () {
    it('Mints amount equal to value returned by function', async function () {
      const holderAddress = holder.address;

      await btrfly.mint(holderAddress, ethers.utils.parseUnits('3000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('1000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('1000', 'gwei'));

      const btrflyV2BalanceBefore = await btrflyV2.balanceOf(holderAddress);
      const btrflyBalance = await btrfly.balanceOf(holderAddress);
      const xBtrflyBalance = await xBtrfly.balanceOf(holderAddress);
      const wxBtrflyBalance = await wxBtrfly.balanceOf(holderAddress);
      const valueWxBase = (
        await wxBtrfly.wBTRFLYValue(btrflyBalance.add(xBtrflyBalance))
      ).add(wxBtrflyBalance);

      await tokenMigrator
        .connect(holder)
        .migrate(
          await wxBtrfly.balanceOf(holderAddress),
          await xBtrfly.balanceOf(holderAddress),
          await btrfly.balanceOf(holderAddress),
          holderAddress,
          false
        );
      const btrflyV2BalanceAfter = await btrflyV2.balanceOf(holderAddress);

      expect(btrflyV2BalanceAfter.sub(btrflyV2BalanceBefore)).to.equal(
        valueWxBase
      );
    });

    it('Mints tokens to correct recipient', async function () {
      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('3000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('1000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('1000', 'gwei'));
      const valueWxBase = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      const migrateEvent111 = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          receiver.address,
          false,
        ]
      );

      await validateEvent(
        migrateEvent111,
        'Migrate(address,address,bool,uint256)',
        {
          to: receiver.address,
          from: holderAddress,
          rl: false,
          value: valueWxBase.mul(toBN(3)),
        }
      );

      expect(await btrflyV2.balanceOf(receiver.address)).to.equal(
        valueWxBase.mul(toBN(3))
      );
    });

    it('Burns BTRFLYV1 Tokens', async function () {
      const btrflyV1SupplyPre = await btrfly.totalSupply();

      const holderAddress = holder.address;
      await btrfly.mint(holderAddress, ethers.utils.parseUnits('3000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('1000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('1000', 'gwei'));
      const valueWxBase = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      await tokenMigrator
        .connect(holder)
        .migrate(
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          receiver.address,
          false
        );

      expect((await btrfly.totalSupply()).div(toBN(10))).to.equal(
        btrflyV1SupplyPre.div(toBN(10))
      );
      expect(await btrfly.balanceOf(tokenMigrator.address)).to.equal(toBN(0));
    });

    it('Locks tokens when rl is set to True', async function () {
      const holderAddress = holder.address;
      expect(await rlBtrfly.lockedBalanceOf(holderAddress)).to.equal(toBN(0));
      expect(await rlBtrfly.lockedBalanceOf(receiver.address)).to.equal(
        toBN(0)
      );

      await btrfly.mint(holderAddress, ethers.utils.parseUnits('6000', 'gwei'));
      await redactedStakingHelper
        .connect(holder)
        .stake(ethers.utils.parseUnits('2000', 'gwei'));
      await wxBtrfly
        .connect(holder)
        .wrapFromBTRFLY(ethers.utils.parseUnits('2000', 'gwei'));
      const valueWxBase = await wxBtrfly.wBTRFLYValue(
        ethers.utils.parseUnits('1000', 'gwei')
      );

      const migrateEventToHolder = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          holderAddress,
          true,
        ]
      );

      await validateEvent(
        migrateEventToHolder,
        'Migrate(address,address,bool,uint256)',
        {
          to: holderAddress,
          from: holderAddress,
          rl: true,
          value: valueWxBase.mul(toBN(3)),
        }
      );

      expect(await rlBtrfly.lockedBalanceOf(holderAddress)).to.equal(
        valueWxBase.mul(toBN(3))
      );

      const migrateEventToReceiver = await callAndReturnEvent(
        tokenMigrator.connect(holder).migrate,
        [
          valueWxBase,
          ethers.utils.parseUnits('1000', 'gwei'),
          ethers.utils.parseUnits('1000', 'gwei'),
          receiver.address,
          true,
        ]
      );

      await validateEvent(
        migrateEventToReceiver,
        'Migrate(address,address,bool,uint256)',
        {
          to: receiver.address,
          from: holderAddress,
          rl: true,
          value: valueWxBase.mul(toBN(3)),
        }
      );

      expect(await rlBtrfly.lockedBalanceOf(receiver.address)).to.equal(
        valueWxBase.mul(toBN(3))
      );
    });
  });
});
