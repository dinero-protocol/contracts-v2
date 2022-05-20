import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { increaseBlockTimestamp } from './helpers';
import { BTRFLY, Mariposa, Vesting } from '../typechain';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';

describe('Vesting', function () {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let mariposa: Mariposa;
  let vesting: Vesting;
  let btrfly: BTRFLY;
  let ownerships: string[];
  let basisPoints: number[];
  let quarters: number[];
  let tokensUnlocking: BigNumber[];
  let tokensUnlockingSum: BigNumber;

  before(async function () {
    ({
      admin,
      mariposa,
      vesting,
      btrfly,
      ownerships,
      basisPoints,
      quarters,
      tokensUnlocking,
      alice,
      bob,
      carol,
    } = this);

    // setup mariposa to have allowance to mint tokens to vesting
    tokensUnlockingSum = tokensUnlocking.reduce((prev, cur) => prev.add(cur));
    await mariposa.connect(admin).addMinter(vesting.address);
    await mariposa
      .connect(admin)
      .increaseAllowance(vesting.address, tokensUnlockingSum);
  });

  describe('set up state correctly', function () {
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

  describe('mint', () => {
    it('mints correct amount', async () => {
      await increaseBlockTimestamp(quarters[0]);
      const minters = [alice, bob, carol];
      const totalTokensForQuarter = await vesting.tokensUnlocking(quarters[0]);

      for (let i = 0; i < minters.length; i++) {
        const basisPointForMinter = await vesting.basisPoints(
          minters[i].address
        );
        const expectedTokens = totalTokensForQuarter
          .mul(basisPointForMinter)
          .div(BigNumber.from(1e8));

        await vesting.connect(minters[i]).mint(quarters[0]);
        const balance = await btrfly.balanceOf(minters[i].address);

        expect(expectedTokens).to.equal(balance);
      }
    });

    it('fail if already minted', async () => {
      const minters = [alice, bob, carol];
      for (let i = 0; i < minters.length; i++) {
        await expect(
          vesting.connect(minters[i]).mint(quarters[0])
        ).to.revertedWith('Vesting: already minted');
      }
    });

    it('correct mint event', async () => {
      increaseBlockTimestamp(quarters[1]);
      const basisPointsForAlice = await vesting.basisPoints(alice.address);
      const totalTokensMintingAtQuarter = await vesting.tokensUnlocking(
        quarters[1]
      );
      const tokensForAlice = totalTokensMintingAtQuarter
        .mul(basisPointsForAlice)
        .div(1e8);

      await expect(vesting.connect(alice).mint(quarters[1]))
        .to.emit(vesting, 'Minted')
        .withArgs(alice.address, quarters[1], tokensForAlice);
    });
  });

  describe('basispoints', () => {
    it('fail if basis point overflow', async () => {
      await expect(
        vesting.assignBasisPoint(alice.address, 40 * 1e6)
      ).to.be.revertedWith('Vesting: basis point overflow');
    });

    it('remove basisPoints and check unallocated', async () => {
      const bobsCurrentBasisPoints = await vesting.basisPoints(bob.address);

      await expect(vesting.connect(admin).removeBasisPoint(bob.address))
        .to.emit(vesting, 'RemovedBasisPoint')
        .withArgs(bob.address, bobsCurrentBasisPoints);

      const unallocated = await vesting.getUnallocBasisPoint();
      expect(unallocated).to.equal(bobsCurrentBasisPoints);
    });

    it('assigns unallocated basis points', async () => {
      const unallocated = await vesting.getUnallocBasisPoint();
      const half = BigNumber.from(unallocated / 2);
      const distributeToArray = [alice, carol];

      for (let i = 0; i < distributeToArray.length; i++) {
        const distributeTo = distributeToArray[i].address;
        await expect(vesting.assignBasisPoint(distributeTo, half))
          .to.emit(vesting, 'AssignedBasisPoint')
          .withArgs(distributeTo, half);
      }
    });
  });

  describe('tokensUnlocking', () => {
    it('Should update tokens unlocking', async () => {
      await expect(
        vesting.updateTokensUnlocking(0, 30 * 1e6)
      ).to.be.revertedWith('Vesting: zero quarter');

      await expect(
        vesting.updateTokensUnlocking(
          quarters[2],
          parseUnits('40000', await btrfly.decimals())
        )
      )
        .to.emit(vesting, 'UpdatedTokensUnlocking')
        .withArgs(quarters[2], parseUnits('40000', await btrfly.decimals()));
      tokensUnlockingSum = tokensUnlockingSum.add(
        parseUnits('10000', await btrfly.decimals())
      );
      tokensUnlocking[2] = parseUnits('40000', await btrfly.decimals());
    });
  });
});
