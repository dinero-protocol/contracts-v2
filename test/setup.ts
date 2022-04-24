import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { impersonateAddressAndReturnSigner, toBN } from './helpers';

let admin: SignerWithAddress;
let notAdmin: SignerWithAddress;
let multisig: SignerWithAddress;

const btrflyAddress = '0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A';
const multisigAddress = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
const adminBtrflyBalance = toBN(100e9);

before(async function () {
  [admin, notAdmin, multisig] = await ethers.getSigners();

  multisig = await impersonateAddressAndReturnSigner(admin, multisigAddress);
  const btrfly = await ethers.getContractAt('BTRFLY', btrflyAddress);
  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(admin.address, btrfly.address);

  // Fund the admin address with some BTRFLY for testing purposes
  await btrfly.connect(multisig).transfer(admin.address, adminBtrflyBalance);

  this.admin = admin;
  this.notAdmin = notAdmin;
  this.multisig = multisig;
  this.btrfly = btrfly;
  this.rlBtrfly = rlBtrfly;
});
