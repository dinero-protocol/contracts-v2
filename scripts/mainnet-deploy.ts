import { ethers } from 'hardhat';
import {
  Mariposa,
  MockDistributor,
  RewardDistributor,
  RLBTRFLY,
  TokenMigrator,
} from '../typechain';
import { BTRFLYV2 } from '../typechain/BTRFLYV2';
import {
  btrflyAddress,
  distributorAddress,
  mariposaCap,
  multisigAddress,
  stakingAddress,
  wxBtrflyAddress,
  xBtrflyAddress,
} from './constants';

async function main() {
  /**
   * @dev params
   */
  const strictDeprecationCheck = true;

  /**
   * @dev before deployment check contracts are deprecated
   */
  const [deployer] = await ethers.getSigners();

  const distributor = (await ethers.getContractAt(
    'MockDistributor',
    distributorAddress
  )) as MockDistributor;

  const currentMintingRate = (await distributor.info(0)).rate;

  if (currentMintingRate.toNumber() > 0 && strictDeprecationCheck) {
    console.log('staking contract not deprecated');
    process.exit(1);
  }

  /**
   * @dev deploy v2 token
   */
  const btrflyV2 = (await (
    await ethers.getContractFactory('BTRFLYV2')
  ).deploy()) as BTRFLYV2;

  await btrflyV2.deployed();

  console.log(`btrflyV2 token: ${btrflyV2.address}`);

  /**
   * @dev deploy rlBtrfly
   */

  const rlBtrfly = (await (
    await ethers.getContractFactory('RLBTRFLY')
  ).deploy(btrflyV2.address)) as RLBTRFLY;

  await rlBtrfly.deployed();

  console.log(`rlBtrfly: ${rlBtrfly.address}`);

  /**
   * @dev deploy mariposa and set as minter
   */

  const mariposa = (await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrflyV2.address, mariposaCap)) as Mariposa;

  await mariposa.deployed();

  console.log(`mariposa: ${mariposa.address}`);

  const setMariposaAsMinter = await (
    await btrflyV2.grantRole(await btrflyV2.MINTER_ROLE(), mariposa.address)
  ).wait();

  console.log(`set mariposa as minter: ${setMariposaAsMinter.transactionHash}`);

  /**
   * @dev deploy token migrator and set mariposa allowance
   */

  const tokenMigrator = (await (
    await ethers.getContractFactory('TokenMigrator')
  ).deploy(
    wxBtrflyAddress,
    xBtrflyAddress,
    btrflyV2.address,
    btrflyAddress,
    mariposa.address,
    stakingAddress,
    rlBtrfly.address
  )) as TokenMigrator;

  await tokenMigrator.deployed();

  console.log(`tokenMigrator: ${tokenMigrator.address}`);

  const setTokenMigratorAsMinter = await (
    await mariposa.addMinter(tokenMigrator.address)
  ).wait();

  console.log(
    `mariposa: set token migrator as minter: ${setTokenMigratorAsMinter.transactionHash}`
  );

  /**
   * @dev deploy reward distributor
   */

  const rewardDistributor = (await (
    await ethers.getContractFactory('RewardDistributor')
  ).deploy(multisigAddress)) as RewardDistributor;

  await rewardDistributor.deployed();

  console.log(`rewards distributor: ${rewardDistributor.address}`);

  /**
   * @dev revoke all deployer permissions and set redacted multisig as owner
   */

  const setMultisigBtrflyV2Admin = await (
    await btrflyV2.grantRole(
      await btrflyV2.DEFAULT_ADMIN_ROLE(),
      multisigAddress
    )
  ).wait();

  console.log(
    `btrflyV2: set multisig as admin: ${setMultisigBtrflyV2Admin.transactionHash}`
  );

  const revokeDeployerBtrflyV2Admin = await (
    await btrflyV2.revokeRole(
      await btrflyV2.DEFAULT_ADMIN_ROLE(),
      deployer.address
    )
  ).wait();

  console.log(
    `btrflyV2: revoke deployer admin role: ${revokeDeployerBtrflyV2Admin.transactionHash}`
  );

  const setMultisigRlBtrflyOwner = await (
    await rlBtrfly.transferOwnership(multisigAddress)
  ).wait();

  console.log(
    `rlBtrfly: ownership transfer to multisig: ${setMultisigRlBtrflyOwner.transactionHash}`
  );

  const setMariposaOwner = await (
    await mariposa.transferOwnership(multisigAddress)
  ).wait();

  console.log(
    `mariposa: ownership transfer to multisig: ${setMariposaOwner.transactionHash}`
  );

  const setRewardDistributorOwner = await (
    await rewardDistributor.transferOwnership(multisigAddress)
  ).wait();

  console.log(
    `reward distributor: ownership transfer to multisig: ${setRewardDistributorOwner.transactionHash}`
  );
  /**
   * @dev for testing copy paste to test-contracts-state.ts
   */
  console.log(`const btrflyV2Address = '${btrflyV2.address}'`);
  console.log(`const rlBtrflyAddress = '${rlBtrfly.address}'`);
  console.log(`const mariposaAddress = '${mariposa.address}' `);
  console.log(`const tokenMigratorAddress = '${tokenMigrator.address}'`);
  console.log(
    `const rewardDistributorAddress = '${rewardDistributor.address}'`
  );

  //!TODO: SET TOKEN MIGRATOR ALLOWANCE TO TOTAL SUPPLY OF V1
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
