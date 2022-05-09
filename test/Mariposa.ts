import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract, Signer } from 'ethers';
import { expect } from 'chai';
import { impersonateSigner, fastForwardEightHours } from './helpers';

describe('Mariposa Contract', () => {
  let Mariposa: Contract;
  let btrfly: Contract;

  let multisig_signer: Signer;
  let mariposa_signer: Signer;
  let department1: SignerWithAddress;
  let department2: SignerWithAddress;
  let wallet: SignerWithAddress;

  const multisig_addr = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
  const btrfly_addr = '0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A';
  const cap = '5000000000000000000000000';
  const epoch = 60 * 60 * 8; // 8 hours
  const txnAmt = '25000000000000000000';

  let snapshotId: string;

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  before(async () => {
    multisig_signer = await impersonateSigner(multisig_addr);
    [department1, department2, wallet] = await ethers.getSigners();

    btrfly = await ethers.getContractAt('BTRFLY', btrfly_addr, multisig_signer);

    Mariposa = await (
      await ethers.getContractFactory('Mariposa')
    ).deploy(btrfly_addr, cap, epoch);

    await Mariposa.transferOwnership(multisig_addr);
    await btrfly.connect(multisig_signer).setVault(Mariposa.address);
    mariposa_signer = await impersonateSigner(Mariposa.address);
  });

  describe('constructor', () => {
    it('Should check contract variables', async () => {
      const _btrfly = await Mariposa.btrfly();
      const _cap = await Mariposa.cap();
      const _epochSeconds = await Mariposa.epochSeconds();

      expect(_btrfly).to.equal(btrfly_addr);
      expect(_cap).to.equal(cap);
      expect(_epochSeconds).to.equal(epoch);
    });
  });

  describe('vault', () => {
    it('Confirm that the vault of the BTRFLY Contract is Mariposa', async () => {
      const vault_addr = await btrfly.connect(multisig_signer).vault();
      expect(vault_addr).to.equal(Mariposa.address);
    });
  });

  describe('minting btrfly permissions', () => {
    it('Tries minting BTRFLY tokens with non-vault contract as signer', async () => {
      await expect(
        btrfly.connect(multisig_signer).mint(wallet.getAddress(), txnAmt)
      ).to.be.revertedWith('VaultOwned: caller is not the Vault');
    });

    it('Should mint BTRFLY tokens with Mariposa set as the signer', async () => {
      const balBefore = await btrfly.balanceOf(wallet.getAddress());
      await btrfly.connect(mariposa_signer).mint(wallet.getAddress(), txnAmt);
      const balAfter = await btrfly.balanceOf(wallet.getAddress());

      expect(balAfter).to.equal(balBefore + txnAmt);
    });
  });

  describe('departments', () => {
    it('Tries setting a department address for a department that does not exist', async () => {
      const count = await Mariposa.departmentCount();
      const extraDepartment = count + 1;

      await expect(
        Mariposa.connect(multisig_signer).setAddressDepartment(
          extraDepartment,
          department1.getAddress()
        )
      ).to.be.revertedWith("Mariposa : Department doesn't exist");
    });

    it('Adds departments that report to Mariposa for minting tokens', async () => {
      const mintRate = ['2500000000', '0'];

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);

        const department = await Mariposa.getDepartment(i);
        const epoch = department.lastDistributionEpoch;
        const count = await Mariposa.departmentCount();

        expect(epoch).to.equal(0);
        expect(count).to.equal(i);
      }
    });

    it('Sets the address of a department', async () => {
      const departments = [department1, department2];
      const mintRate = ['2500000000', '0'];

      for (let i = 1; i <= 2; i++) {
        // adds new department with mintRate
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
        const id = await Mariposa.getAddressDepartment(
          departments[i - 1].getAddress()
        );

        expect(id).to.be.equals(i);
      }
    });
  });

  describe('mintRate', () => {
    it('Should update the mint rate of each department accordingly', async () => {
      const departments = [department1, department2];
      const mintRate = ['2500000000', '0'];
      const newMintRate = ['5000000000', '5000000000'];

      //  adds new departments with mintRates
      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );

        // update mintRate
        await Mariposa.connect(multisig_signer).setDepartmentAdjustment(
          newMintRate[i - 1],
          i
        );

        const department = await Mariposa.getDepartment(i);
        const expected_mintRate = department.mintRate;
        expect(newMintRate[i - 1]).to.equals(expected_mintRate);
      }
    });

    it('Should give the total number of tokens to be added to the departments next epoch', async () => {
      const departments = [department1, department2];
      const mintRate = ['5000000000', '5000000000'];

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
      }

      const count = await Mariposa.departmentCount();
      const totalMintRate = await Mariposa.currentEmissions();
      let mintCount = 0;

      // find total mint rate across all departments
      for (let i = 1; i <= count; i++) {
        const department = await Mariposa.getDepartment(i);
        mintCount += parseInt(department.mintRate);
      }
      expect(totalMintRate).to.equals(mintCount);
    });
  });

  describe('distribute', () => {
    it('Call distribute once per epoch updating the respective fields', async () => {
      const departments = [department1, department2];
      const mintRate = ['5000000000', '5000000000'];

      let totalSupply = 0;

      // get current epoch
      const { timestamp } = await ethers.provider.getBlock('latest');
      const currentEpoch = Math.trunc(timestamp / epoch);

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
      }

      const count = await Mariposa.departmentCount();
      for (let i = 1; i <= count; i++) {
        // calculate new department balance against balance from calling distribute
        const departmentInfo = await Mariposa.getDepartment(i);
        const previousEpoch = departmentInfo.lastDistributionEpoch;
        const mintRate = departmentInfo.mintRate;
        totalSupply += mintRate * (currentEpoch - previousEpoch);

        await Mariposa.distribute(i);
        const currentOutstanding = await Mariposa.currentOutstanding();

        const department = await Mariposa.getDepartment(i);
        const latestEpoch = department.lastDistributionEpoch;

        expect(totalSupply).to.equal(currentOutstanding);
        expect(currentEpoch).to.equal(latestEpoch);
      }
    });

    it('Tries calling distribute on a department in the same epoch', async () => {
      const departments = [department1, department2];
      const mintRate = ['5000000000', '5000000000'];

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
      }

      const count = await Mariposa.departmentCount();
      for (let i = 1; i <= count; i++) {
        await Mariposa.distribute(i);
        await expect(Mariposa.distribute(i)).to.be.revertedWith(
          'Mariposa : distribution event already occurred this epoch'
        );
      }
    });
  });

  describe('requests', () => {
    it('Should check that requests update department budgets correctly', async () => {
      const departments = [department1, department2];
      const mintRate = ['5000000000', '5000000000'];

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
      }

      const count = await Mariposa.departmentCount();
      for (let i = 1; i <= count; i++) {
        await Mariposa.distribute(i);

        const department = departments[i - 1].getAddress();
        const btrflyInDepartment_before = await btrfly.balanceOf(department);
        const departmentBalance = await Mariposa.getDepartmentBalance(i);
        const requestedAmount = departmentBalance;

        await Mariposa.connect(departments[i - 1]).request(requestedAmount);

        const btrflyInDepartment_after = await btrfly.balanceOf(department);
        const departmentBalance_after = await Mariposa.getDepartmentBalance(i);

        expect(btrflyInDepartment_after).to.equal(
          btrflyInDepartment_before + requestedAmount
        );
        expect(departmentBalance_after).to.equal(
          departmentBalance - requestedAmount
        );
      }
    });
  });

  describe('exceed cap', () => {
    it("Should update the mint rate of an existing department and ensure we don't exceed the cap", async () => {
      const departments = [department1, department2];
      const mintRate = ['0', '0'];

      for (let i = 1; i <= 2; i++) {
        await Mariposa.connect(multisig_signer).addDepartment(mintRate[i - 1]);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          i,
          departments[i - 1].getAddress()
        );
      }
      const count = await Mariposa.departmentCount();

      // ensures that mint rate will exceed cap for next epoch
      for (let i = 1; i <= count; i++) {
        fastForwardEightHours();
        await expect(
          Mariposa.connect(multisig_signer).setMintRate(i, cap)
        ).to.be.revertedWith(
          'Mariposa: mint rate will exceed cap in the next epoch'
        );
      }
    });
  });
});
