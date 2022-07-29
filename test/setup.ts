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
const adminBtrflyBalance = toBN(100e18);
const mariposaCap = ethers.utils.parseEther(toBN(5.2e6).toString()); // 5.2m in 1e18

before(async function () {
  [admin, notAdmin, multisig, alice, bob] = await ethers.getSigners();

  multisig = await impersonateAddressAndReturnSigner(admin, multisigAddress);

  const btrfly = await ethers.getContractAt(
    'BTRFLY',
    '0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A'
  );
  const xBtrfly = await ethers.getContractAt(
    'xBTRFLY',
    '0xCC94Faf235cC5D3Bf4bEd3a30db5984306c86aBC'
  );
  const wxBtrfly = await ethers.getContractAt(
    'wxBTRFLY',
    '0x4B16d95dDF1AE4Fe8227ed7B7E80CF13275e61c9'
  );
  const redactedStaking = await ethers.getContractAt(
    'contracts/interfaces/IStaking.sol:IStaking',
    '0xBdE4Dfb0dbb0Dd8833eFb6C5BD0Ce048C852C487'
  );
  const redactedStakingHelper = await ethers.getContractAt(
    'IStakingHelper',
    '0xC0840Ec5527d3e70d66AE6575642916F3Fd18aDf'
  );
  const btrflyV2 = (await (
    await ethers.getContractFactory('BTRFLYV2')
  ).deploy()) as BTRFLYV2;
  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrflyV2.address);
  const mariposa = await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrflyV2.address, mariposaCap);
  const rewardDistributor = await (
    await ethers.getContractFactory('RewardDistributor')
  ).deploy(admin.address);

  // Fund the admin address with some BTRFLYV2 for RL TEST
  await btrflyV2.grantRole(await btrflyV2.MINTER_ROLE(), admin.address);
  await btrflyV2.grantRole(await btrflyV2.MINTER_ROLE(), mariposa.address);
  await btrflyV2.mint(admin.address, adminBtrflyBalance);

  // Pre-approve for easier and shorter test run
  await btrflyV2.approve(rlBtrfly.address, ethers.constants.MaxUint256);

  this.admin = admin;
  this.notAdmin = notAdmin;
  this.alice = alice;
  this.bob = bob;
  this.multisig = multisig;
  this.btrfly = btrfly;
  this.xBtrfly = xBtrfly;
  this.wxBtrfly = wxBtrfly;
  this.redactedStaking = redactedStaking;
  this.redactedStakingHelper = redactedStakingHelper;
  this.btrflyV2 = btrflyV2;
  this.rlBtrfly = rlBtrfly;
  this.mariposa = mariposa;
  this.rewardDistributor = rewardDistributor;
  this.mariposaSupplyCap = mariposaCap;
  this.zeroAddress = '0x0000000000000000000000000000000000000000';
  this.redactedMultisig = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
});
