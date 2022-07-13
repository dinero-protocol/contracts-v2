import { ethers } from 'hardhat';
import { toBN } from '../test/helpers';
import { BTRFLYV2, Mariposa, RLBTRFLY, TokenMigrator } from '../typechain';
import {
  btrflyAddress,
  multisigAddress,
  stakingAddress,
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

  const btrflyV2Address = '0x3f458FDD6D5E13Af5D6f966A338bf9373a248336';
  const rlBtrflyAddress = '0x1b22d7162067A0FaeCc21b5d84421c1e383eAa56';
  const mariposaAddress = '0x4AF2FE91Ef78e76c91aa77eF5b43973eAb371A66';
  const tokenMigratorAddress = '0x63e9882E1D996D7b87F8690BE6E5C1b08205ae13';

  // !TODO  get correct amounts
  const mariposaCap = ethers.utils.parseEther(toBN(5.2e6).toString()); // 5.2m in 1e18
  const totalSupplyOfV1inV2 = toBN(1e18);

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
