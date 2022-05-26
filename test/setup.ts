import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { toBN } from './helpers';

let admin: SignerWithAddress;
let notAdmin: SignerWithAddress;

const adminBtrflyBalance = toBN(100e18);

before(async function () {
  [admin, notAdmin] = await ethers.getSigners();

  const btrflyv2 = await (await ethers.getContractFactory("BTRFLYV2")).deploy();
  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrflyv2.address);

  // Fund the admin address with some BTRFLY for testing purposes
  await btrflyv2.setVault(await admin.getAddress());
  await btrflyv2.mint(await admin.getAddress(),adminBtrflyBalance);

  this.admin = admin;
  this.notAdmin = notAdmin;
  this.btrflyv2 = btrflyv2;
  this.rlBtrfly = rlBtrfly;
});
