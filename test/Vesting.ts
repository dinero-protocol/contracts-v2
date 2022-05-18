import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { increaseBlockTimestamp } from './helpers';
import { Mariposa, Vesting } from '../typechain';
const { BigNumber } = ethers;
const { parseUnits } = ethers.utils;

describe('Vesting', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let mariposa: Mariposa;
  let vesting: Vesting;
  let ownerships: string[];
  let basisPoints: number[];
  let quarters: number[];
  let tokensUnlocking: any;
  let tokensUnlockingSum: any;

  before(async function () {
    ({
      mariposa,
      vesting,
      ownerships,
      basisPoints,
      quarters,
      tokensUnlocking,
      alice,
      bob,
      carol,
    } = this);
    tokensUnlockingSum = BigNumber.from(0);
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      expect(await vesting.mariposa()).to.equal(mariposa.address);
      for (let i = 0; i < ownerships.length; i++)
        expect(await vesting.basisPoints(ownerships[i])).to.equal(
          basisPoints[i]
        );

      for (let i = 0; i < quarters.length; i++) {
        expect(await vesting.tokensUnlocking(quarters[i])).to.equal(
          tokensUnlocking[i]
        );
        tokensUnlockingSum = tokensUnlockingSum.add(tokensUnlocking[i]);
      }
    });
  });

  describe('basispoint', function () {
    it('Should assign basis point', async function () {
      await expect(
        vesting.assignBasisPoint(alice.address, 40 * 1e6)
      ).to.be.revertedWith('Vesting: basis point overflow');

      await expect(vesting.removeBasisPoint(bob.address))
        .to.emit(vesting, 'RemovedBasisPoint')
        .withArgs(bob.address, BigNumber.from(30 * 1e6));
      await expect(vesting.removeBasisPoint(carol.address))
        .to.emit(vesting, 'RemovedBasisPoint')
        .withArgs(carol.address, BigNumber.from(70 * 1e6));

      await expect(vesting.assignBasisPoint(bob.address, 40 * 1e6))
        .to.emit(vesting, 'AssignedBasisPoint')
        .withArgs(bob.address, BigNumber.from(40 * 1e6));
      await expect(
        vesting.assignBasisPoint(carol.address, 40 * 1e6)
      ).to.be.revertedWith('Vesting: basis point overflow');
      await expect(vesting.assignBasisPoint(carol.address, 30 * 1e6))
        .to.emit(vesting, 'AssignedBasisPoint')
        .withArgs(carol.address, BigNumber.from(30 * 1e6));
      basisPoints[1] = 40 * 1e6;
      basisPoints[2] = 30 * 1e6;
    });
  });

  describe('tokensUnlocking', function () {
    it('Should update tokens unlocking', async function () {
      await expect(
        vesting.updateTokensUnlocking(0, 30 * 1e6)
      ).to.be.revertedWith('Vesting: zero quarter');

      await expect(
        vesting.updateTokensUnlocking(quarters[2], parseUnits('40000', 9))
      )
        .to.emit(vesting, 'UpdatedTokensUnlocking')
        .withArgs(quarters[2], parseUnits('40000', 9));
      tokensUnlockingSum = tokensUnlockingSum.add(parseUnits('10000', 9));
      tokensUnlocking[2] = parseUnits('40000', 9);
    });
  });

  describe('mint', function () {
    before(async function () {
      await expect(vesting.mint(quarters[0])).revertedWith('NotMinter()');
      await mariposa.addMinter(vesting.address);
      await mariposa.increaseAllowance(vesting.address, tokensUnlockingSum);
    });

    it('Should mint tokens correctly', async function () {
      await expect(vesting.connect(alice).mint(quarters[0]))
        .to.emit(vesting, 'Minted')
        .withArgs(
          alice.address,
          quarters[0],
          tokensUnlocking[0].mul(basisPoints[0]).div(1e8)
        );
      await expect(vesting.connect(alice).mint(quarters[1])).to.revertedWith(
        'Vesting: can not mint'
      );
      await expect(vesting.connect(alice).mint(quarters[0])).to.revertedWith(
        'Vesting: already minted'
      );

      await increaseBlockTimestamp(300 * 86400);
      await expect(vesting.connect(alice).mint(quarters[1]))
        .to.emit(vesting, 'Minted')
        .withArgs(
          alice.address,
          quarters[1],
          tokensUnlocking[1].mul(basisPoints[0]).div(1e8)
        );
      await expect(vesting.connect(alice).mint(quarters[2])).to.revertedWith(
        'Vesting: can not mint'
      );

      await increaseBlockTimestamp(300 * 86400);
      await expect(vesting.connect(alice).mint(quarters[2]))
        .to.emit(vesting, 'Minted')
        .withArgs(
          alice.address,
          quarters[2],
          tokensUnlocking[2].mul(basisPoints[0]).div(1e8)
        );
    });
  });
});
