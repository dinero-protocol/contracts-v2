import { ethers } from 'hardhat';
import {
  BTRFLYV2,
  Mariposa,
  RewardDistributor,
  RLBTRFLY,
  TokenMigrator,
} from '../typechain';
import {
  btrflyAddress,
  mariposaCap,
  multisigAddress,
  stakingAddress,
  totalSupplyOfV1inV2,
  wxBtrflyAddress,
  xBtrflyAddress,
} from './constants';

type Error = {
  error: string;
  contract: string;
};

async function main() {
  const errors: Error[] = [];
  /**
   * @dev Contract addresses for deployed contracts. Copy paste from log from mainnet-deploy.ts
   */
  const btrflyV2Address = '0x554978ebd620065ce37B054bE21B6faD78C60e06';
  const rlBtrflyAddress = '0x06feE6f5961eCDAF0D220fEfdF43bbd9dDfa0BE9';
  const mariposaAddress = '0xF69a87ED2549591A97c3F91F031950e391eD3b36';
  const tokenMigratorAddress = '0x238c0548e53a21fAD65F68E326E42caBB896887b';
  const rewardDistributorAddress = '0x2f4a17C18E62fCCA32D131547b454cB9c3344876';

  console.log({
    totalSupplyOfV1inV2: totalSupplyOfV1inV2.toString(),
    mariposaCap: mariposaCap.toString(),
  });

  const [deployer] = await ethers.getSigners();

  const btrflyV2 = (await ethers.getContractAt(
    'BTRFLYV2',
    btrflyV2Address
  )) as BTRFLYV2;

  const rlBtrfly = (await ethers.getContractAt(
    'RLBTRFLY',
    rlBtrflyAddress
  )) as RLBTRFLY;

  const mariposa = (await ethers.getContractAt(
    'Mariposa',
    mariposaAddress
  )) as Mariposa;

  const tokenMigrator = (await ethers.getContractAt(
    'TokenMigrator',
    tokenMigratorAddress
  )) as TokenMigrator;

  const rewardDistributor = (await ethers.getContractAt(
    'RewardDistributor',
    rewardDistributorAddress
  )) as RewardDistributor;

  /**
   * @dev btrflyV2 permissions
   */

  const isDeployerBtrflyV2Admin = await btrflyV2.hasRole(
    await btrflyV2.DEFAULT_ADMIN_ROLE(),
    deployer.address
  );

  if (isDeployerBtrflyV2Admin) {
    errors.push({ contract: 'btrflyV2', error: 'deployer has admin role' });
  }

  const isDeployerBtrflyV2Minter = await btrflyV2.hasRole(
    await btrflyV2.MINTER_ROLE(),
    deployer.address
  );

  if (isDeployerBtrflyV2Minter) {
    errors.push({ contract: 'btrflyV2', error: 'deployer has minter role' });
  }

  const isMultisigBtrflyV2Admin = await btrflyV2.hasRole(
    await btrflyV2.DEFAULT_ADMIN_ROLE(),
    multisigAddress
  );

  if (!isMultisigBtrflyV2Admin) {
    errors.push({ contract: 'btrflyV2', error: 'multisig is not admin' });
  }

  /**
   * @dev rlBtrfly permissions
   */

  const isDeployerRlBtrflyOwner =
    (await rlBtrfly.owner()).toLowerCase() === deployer.address.toLowerCase();

  if (isDeployerRlBtrflyOwner) {
    errors.push({ contract: 'rlBtrfly', error: 'deployer is owner' });
  }

  const isRedactedMultisigRlBtrflyOwner =
    (await rlBtrfly.owner()).toLowerCase() === multisigAddress.toLowerCase();

  if (!isRedactedMultisigRlBtrflyOwner) {
    errors.push({ contract: 'rlBtrfly', error: 'multisig is not owner' });
  }

  /**
   * @dev Mariposa permissions
   */

  const isDeployerMariposaOwner =
    (await mariposa.owner()).toLowerCase() === deployer.address.toLowerCase();

  if (isDeployerMariposaOwner) {
    errors.push({ contract: 'mariposa', error: 'deployer is owner' });
  }

  const isRedactedMultisigMariposaOwner =
    (await mariposa.owner()).toLowerCase() === multisigAddress.toLowerCase();

  if (!isRedactedMultisigMariposaOwner) {
    errors.push({ contract: 'mariposa', error: 'multisig is not owner' });
  }

  const isMariposaSupplyCapCorrect =
    (await (await mariposa.supplyCap()).toString()) === mariposaCap.toString();

  if (!isMariposaSupplyCapCorrect) {
    errors.push({ contract: 'mariposa', error: 'supplyCap is wrong' });
  }

  const isTokenMigratorAllowanceCorrect =
    (await (
      await mariposa.mintAllowances(tokenMigrator.address)
    ).toString()) === totalSupplyOfV1inV2.toString();

  if (!isTokenMigratorAllowanceCorrect) {
    errors.push({
      contract: 'mariposa',
      error: 'allowance to token migrator is wrong',
    });
  }

  /**
   * @dev TokenMigrator Setup
   */

  const iswxBtrflySetCorrect =
    (await tokenMigrator.wxBtrfly()).toLowerCase() ===
    wxBtrflyAddress.toLowerCase();

  if (!iswxBtrflySetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'wxBtrfly not set properly',
    });
  }

  const isxBtrflySetCorrect =
    (await tokenMigrator.xBtrfly()).toLowerCase() ===
    xBtrflyAddress.toLowerCase();

  if (!isxBtrflySetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'xBtrfly not set properly',
    });
  }

  const isBtrflyV2SetCorrect =
    (await tokenMigrator.btrflyV2()).toLowerCase() ===
    btrflyV2.address.toLowerCase();

  if (!isBtrflyV2SetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'btrflyV2 not set properly',
    });
  }

  const isBtrflySetCorrect =
    (await tokenMigrator.btrfly()).toLowerCase() ===
    btrflyAddress.toLowerCase();

  if (!isBtrflySetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'btrfly not set properly',
    });
  }

  const isMariposaSetCorrect =
    (await tokenMigrator.mariposa()).toLowerCase() ===
    mariposa.address.toLowerCase();

  if (!isMariposaSetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'mariposa not set properly',
    });
  }

  const isStakingSetCorrect =
    (await tokenMigrator.staking()).toLowerCase() ===
    stakingAddress.toLowerCase();

  if (!isStakingSetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'staking not set properly',
    });
  }

  const isRlBtrflySetCorrect =
    (await tokenMigrator.rlBtrfly()).toLowerCase() ===
    rlBtrfly.address.toLowerCase();

  if (!isRlBtrflySetCorrect) {
    errors.push({
      contract: 'token migrator',
      error: 'rlBtrfly not set properly',
    });
  }

  /**
   * @dev rewards distributor set up
   */

  const isRewardsDistributorMultisigSetCorrect =
    (await rewardDistributor.MULTISIG()).toLocaleLowerCase() ===
    multisigAddress.toLowerCase();

  if (!isRewardsDistributorMultisigSetCorrect) {
    errors.push({
      contract: 'reward distributor',
      error: 'multisig not set correct',
    });
  }

  const isRewardsDistributorOwnershipSetCorrect =
    (await rewardDistributor.owner()).toLowerCase() ===
    multisigAddress.toLowerCase();

  if (!isRewardsDistributorOwnershipSetCorrect) {
    errors.push({
      contract: 'reward distributor',
      error: 'owner not multisig',
    });
  }

  if (errors.length) {
    console.log(errors);
  } else {
    console.log('state is setup properly');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
