import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { impersonateAddressAndReturnSigner, toBN } from './helpers';
import { BTRFLYV2 } from '../typechain/BTRFLYV2';

let admin: SignerWithAddress;
let notAdmin: SignerWithAddress;
let alice: SignerWithAddress;
let bob: SignerWithAddress;
let multisig: SignerWithAddress;

const multisigAddress = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
const adminBtrflyBalance = toBN(100e9);
const mariposaCap = ethers.utils.parseEther(toBN(5.2e6).toString()); // 5.2m in 1e18

before(async function () {
  [admin, notAdmin, multisig, alice, bob] = await ethers.getSigners();

  multisig = await impersonateAddressAndReturnSigner(admin, multisigAddress);

  const btrflyV2 = (await (
    await ethers.getContractFactory('BTRFLYV2')
  ).deploy()) as BTRFLYV2;

  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrflyV2.address);

  const mariposa = await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrflyV2.address, mariposaCap);

  // Fund the admin address with some BTRFLYV2 for RL TEST
  await btrflyV2.setVault(admin.address);
  await btrflyV2.mint(admin.address, adminBtrflyBalance);

  // Pre-approve for easier and shorter test run
  await btrflyV2.approve(rlBtrfly.address, ethers.constants.MaxUint256);

  // Setup for Mariposa TEST
  await btrflyV2.setVault(mariposa.address);

  this.admin = admin;
  this.notAdmin = notAdmin;
  this.alice = alice;
  this.bob = bob;
  this.multisig = multisig;
  this.rlBtrfly = rlBtrfly;
  this.mariposa = mariposa;
  this.mariposaSupplyCap = mariposaCap;
  this.btrflyV2 = btrflyV2;
});
