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

  before(async () => {
    multisig_signer = await impersonateSigner(multisig_addr);
    [department1, department2, wallet] = await ethers.getSigners();

    // Connect to existing contract
    btrfly = await ethers.getContractAt('BTRFLY', btrfly_addr, multisig_signer);

    // Deploy Mock Mariposa
    Mariposa = await (
      await ethers.getContractFactory('Mariposa')
    ).deploy(btrfly_addr, cap, epoch);

    await Mariposa.transferOwnership(multisig_addr);
    await btrfly.connect(multisig_signer).setVault(Mariposa.address);
    mariposa_signer = await impersonateSigner(Mariposa.address);
  });

  describe('constructor', () => {
    it('Should check contract state', async () => {
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
      const mintRate1 = '2500000000';
      await Mariposa.connect(multisig_signer).addDepartment(mintRate1);
      const firstCount = await Mariposa.departmentCount();
      const department_1 = await Mariposa.getDepartment(1);
      const firstEpoch = department_1.lastDistributionEpoch;

      const mintRate2 = '0';
      await Mariposa.connect(multisig_signer).addDepartment(mintRate2);
      const secondCount = await Mariposa.departmentCount();
      const department_2 = await Mariposa.getDepartment(1);
      const secondEpoch = department_2.lastDistributionEpoch;

      expect(firstCount).to.equal(secondCount - 1);
      expect(firstEpoch).to.equal(0);
      expect(secondEpoch).to.equal(0);
    });

    it('Sets the address of a department', async () => {
      const count = await Mariposa.departmentCount();
      const departments = [department1, department2];

      for (let i = 1; i <= count; i++) {
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
      const count = await Mariposa.departmentCount();
      const departments = [department1, department2];

      const newMintRate = '5000000000';
      let expected_mintRate;

      if (count != 0) {
        for (let i = 1; i <= count; i++) {
          await Mariposa.connect(multisig_signer).setDepartmentAdjustment(
            newMintRate,
            i
          );

          const department = await Mariposa.getDepartment(i);
          expected_mintRate = department.mintRate;
        }
      } else {
        // adds new department with mintRate and department address
        const mintRate = '2500000000';
        await Mariposa.connect(multisig_signer).addDepartment(mintRate);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );

        // adjusts the mint rate
        await Mariposa.connect(multisig_signer).setDepartmentAdjustment(
          newMintRate,
          1
        );

        const department = await Mariposa.getDepartment(1);
        expected_mintRate = department.mintRate;
      }
      expect(newMintRate).to.equals(expected_mintRate);
    });

    it('Should give the total number of tokens to be added to the departments next epoch', async () => {
      const count = await Mariposa.departmentCount();

      if (count != 0) {
        const totalMintRate = await Mariposa.currentEmissions();
        let mintCount = 0;
        for (let i = 1; i <= count; i++) {
          let department = await Mariposa.getDepartment(i);
          mintCount += parseInt(department.mintRate);
        }

        expect(totalMintRate).to.equals(mintCount);
      } else {
        // adds new department with mintRate and department address
        const mintRate = '2500000000';
        await Mariposa.connect(multisig_signer).addDepartment(mintRate);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );

        const totalMintRate = await Mariposa.currentEmissions();
        expect(totalMintRate).to.equal(mintRate);
      }
    });
  });

  describe('distribute', () => {
    it('Call distribute once per epoch updating the respective fields', async () => {
      const count = await Mariposa.departmentCount();
      if (count != 0) {
        let totalSupply = 0;

        // get current timestamp
        const { timestamp } = await ethers.provider.getBlock('latest');
        const currentEpoch = Math.trunc(timestamp / epoch);

        for (let i = 1; i <= count; i++) {
          // calculate new department balance against balance from calling distribute
          let departmentInfo = await Mariposa.getDepartment(i);
          const previousEpoch = departmentInfo.lastDistributionEpoch;
          const mintRate = departmentInfo.mintRate;
          totalSupply += mintRate * (currentEpoch - previousEpoch);

          await Mariposa.distribute(i);
          const currentOutstanding = await Mariposa.currentOutstanding();

          expect(totalSupply).to.equal(currentOutstanding);
        }
        let department = await Mariposa.getDepartment(1);
        const latestEpoch = department.lastDistributionEpoch;

        expect(currentEpoch).to.equal(latestEpoch);
      } else {
        // adds new department with mintRate and department address
        const mintRate1 = '2500000000';
        await Mariposa.connect(multisig_signer).addDepartment(mintRate1);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );

        // get current timestamp
        const { timestamp } = await ethers.provider.getBlock('latest');
        const currentEpoch = Math.trunc(timestamp / epoch);

        // calculate new department balance against balance from calling distribute
        let departmentInfo = await Mariposa.getDepartment(1);
        const previousEpoch = departmentInfo.lastDistributionEpoch;
        const mintRate = departmentInfo.mintRate;
        const totalSupply = mintRate * (currentEpoch - previousEpoch);

        await Mariposa.distribute(1);
        const currentOutstanding = await Mariposa.currentOutstanding();

        let department = await Mariposa.getDepartment(1);
        const latestEpoch = department.lastDistributionEpoch;

        expect(totalSupply).to.equal(currentOutstanding);
        expect(currentEpoch).to.equal(latestEpoch);
      }
    });

    it('Tries calling distribute on a department in the same epoch', async () => {
      const count = await Mariposa.departmentCount();
      if (count != 0) {
        for (let i = 1; i <= count; i++) {
          await expect(Mariposa.distribute(i)).to.be.revertedWith(
            'Mariposa : distribution event already occurred this epoch'
          );
        }
      } else {
        // adds new department with mintRate and department address
        const mintRate1 = '0';
        await Mariposa.connect(multisig_signer).addDepartment(mintRate1);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );

        await Mariposa.distribute(1);
        await expect(Mariposa.distribute(1)).to.be.revertedWith(
          'Mariposa : distribution event already occurred this epoch'
        );
      }
    });
  });

  describe('requests', () => {
    it('Should check that requests update department budgets correctly', async () => {
      const departments = [department1, department2];
      const count = await Mariposa.departmentCount();
      if (count != 0) {
        for (let i = 1; i <= count; i++) {
          let department = departments[i - 1].getAddress();
          const btrflyInDepartment_before = await btrfly.balanceOf(department);
          const departmentBalance = await Mariposa.getDepartmentBalance(i);
          const requestedAmount = departmentBalance;

          await Mariposa.connect(departments[i - 1]).request(requestedAmount);

          const btrflyInDepartment_after = await btrfly.balanceOf(department);
          const departmentBalance_after = await Mariposa.getDepartmentBalance(
            i
          );

          expect(btrflyInDepartment_after).to.equal(
            btrflyInDepartment_before + requestedAmount
          );
          expect(departmentBalance_after).to.equal(
            departmentBalance - requestedAmount
          );
        }
      } else {
        // adds new department with mintRate and department address
        const mintRate1 = '250000000000000';
        await Mariposa.connect(multisig_signer).addDepartment(mintRate1);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );
        const btrflyInDepartment_before = await btrfly.balanceOf(
          department1.getAddress()
        );

        await Mariposa.distribute(1);

        const departmentBalance = await Mariposa.getDepartmentBalance(1);
        const requestedAmount = departmentBalance;
        await Mariposa.connect(department1).request(requestedAmount);

        const btrflyInDepartment_after = await btrfly.balanceOf(
          department1.getAddress()
        );
        const departmentBalance_after = await Mariposa.getDepartmentBalance(1);

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
      const count = await Mariposa.departmentCount();
      if (count != 0) {
        // resets mint rate to zero
        for (let i = 1; i <= count; i++) {
          await Mariposa.connect(multisig_signer).setDepartmentAdjustment(0, i);
        }

        // ensures that mint rate will exceed cap for next epoch
        for (let i = 1; i <= count; i++) {
          fastForwardEightHours();
          await expect(
            Mariposa.connect(multisig_signer).setMintRate(i, cap)
          ).to.be.revertedWith(
            'Mariposa: mint rate will exceed cap in the next epoch'
          );
        }
      } else {
        // adds new department with mintRate equal to cap
        const mintRate1 = cap;
        await Mariposa.connect(multisig_signer).addDepartment(mintRate1);
        await Mariposa.connect(multisig_signer).setAddressDepartment(
          1,
          department1.getAddress()
        );

        await expect(Mariposa.distribute(1)).to.be.revertedWith(
          'Mariposa : Cap exceeded'
        );
      }
    });
  });
});
