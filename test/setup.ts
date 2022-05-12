import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { impersonateAddressAndReturnSigner, toBN } from './helpers';
const { parseUnits } = ethers.utils;

let admin: SignerWithAddress;
let notAdmin: SignerWithAddress;
let multisig: SignerWithAddress;

const btrflyAddress = '0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A';
const multisigAddress = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
const adminBtrflyBalance = toBN(100e9);
const mariposaCap = parseUnits("5000000", 9); // 5M

before(async function () {
  [admin, notAdmin, multisig] = await ethers.getSigners();

  multisig = await impersonateAddressAndReturnSigner(admin, multisigAddress);
  const btrfly = await ethers.getContractAt('BTRFLY', btrflyAddress);
  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrfly.address);

  const mariposa = await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrfly.address, mariposaCap);

  // Fund the admin address with some BTRFLY for testing purposes
  await btrfly.connect(multisig).transfer(admin.address, adminBtrflyBalance);
  
  await btrfly.connect(multisig).setVault(mariposa.address);

  this.admin = admin;
  this.notAdmin = notAdmin;
  this.multisig = multisig;
  this.btrfly = btrfly;
  this.rlBtrfly = rlBtrfly;
  this.mariposa = mariposa;
});
