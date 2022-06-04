import { ethers } from 'hardhat';
import { toBN } from '../test/helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';


async function main() {

  const BTRFLYV1ADDRESS = "0xc0d4ceb216b3ba9c3701b291766fdcba977cec3a";
  const XBTRFLYADDRESS = "0xCC94Faf235cC5D3Bf4bEd3a30db5984306c86aBC";
  const WXBTRFLYADDRESS = "0x4B16d95dDF1AE4Fe8227ed7B7E80CF13275e61c9";
  const STAKINGADDRESS = "0xbde4dfb0dbb0dd8833efb6c5bd0ce048c852c487";

  const adminBtrflyBalance = toBN(100e18);
  const mariposaCap = ethers.utils.parseEther(toBN(5.2e6).toString()); // 5.2m in 1e18

  const admin : SignerWithAddress = (await ethers.getSigners())[0] as SignerWithAddress;

  const btrflyV2 = (await (
    await ethers.getContractFactory('BTRFLYV2')
  ).deploy());

  const rlBtrfly = await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrflyV2.address);

  const mariposa = await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrflyV2.address, mariposaCap);

  const tokenMigrator = await (await ethers.getContractFactory("TokenMigrator")).deploy(
    WXBTRFLYADDRESS,
    XBTRFLYADDRESS,
    btrflyV2.address,
    BTRFLYV1ADDRESS,
    mariposa.address,
    STAKINGADDRESS,
    rlBtrfly.address
)

  // Fund the admin address with some BTRFLYV2 for RL TEST
  await btrflyV2.setVault(admin.address);
  await btrflyV2.mint(admin.address, adminBtrflyBalance);
  await btrflyV2.setVault(rlBtrfly.address);

  // Pre-approve for easier and shorter test run
  await btrflyV2.approve(rlBtrfly.address, ethers.constants.MaxUint256);

  console.log("BTRFLYV2 deployed at : " + btrflyV2.address);
  console.log("RLBTRFLY deployed at : " + rlBtrfly.address);
  console.log("Mariposa deployed at : " + mariposa.address);
  console.log("Token Migrator deployed at : " + tokenMigrator.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


