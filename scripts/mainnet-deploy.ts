import { ethers } from 'hardhat';
import { toBN } from '../test/helpers';
import { Mariposa, RLBTRFLY, TokenMigrator } from '../typechain';
import { BTRFLYV2 } from '../typechain/BTRFLYV2';

async function main() {
  //!TODO: Deprecate V1 Contracts ie (Bonds, Staking, Staking Helper, Thecosomata)

  const [deployer] = await ethers.getSigners();

  /**
   * @dev addresses
   */
  const multisigAddress = '0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e';
  const btrflyAddress = '0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A';
  const xBtrfly = '0xCC94Faf235cC5D3Bf4bEd3a30db5984306c86aBC';
  const wxBtrfly = '0x4B16d95dDF1AE4Fe8227ed7B7E80CF13275e61c9';
  const staking = '0xBdE4Dfb0dbb0Dd8833eFb6C5BD0Ce048C852C487';

  /**
   * @dev constants
   */
  //!TODO: GET SUPPLY CAP FROM POLICY
  const mariposaCap = ethers.utils.parseEther(toBN(5.2e6).toString()); // 5.2m in 1e18

  /**
   * @dev deploy v2 token
   */
  const btrflyV2 = await (
    (await (await ethers.getContractFactory('BTRFLYV2')).deploy()) as BTRFLYV2
  ).deployed();

  console.log(`btrflyV2 token: ${btrflyV2.address}`);

  /**
   * @dev deploy rlBtrfly
   */

  const rlBtrfly = await (
    (await (
      await ethers.getContractFactory('RLBTRFLY')
    ).deploy(btrflyV2.address)) as RLBTRFLY
  ).deployed();

  console.log(`rlBtrfly: ${rlBtrfly.address}`);

  /**
   * @dev deploy mariposa and set as minter
   */

  const mariposa = await (
    (await (
      await ethers.getContractFactory('Mariposa')
    ).deploy(btrflyV2.address, mariposaCap)) as Mariposa
  ).deployed();

  console.log(`mariposa: ${mariposa.address}`);

  const setMariposaAsMinter = (
    await btrflyV2.grantRole(await btrflyV2.MINTER_ROLE(), mariposa.address)
  ).wait();

  console.log(
    `set mariposa as minter: ${(await setMariposaAsMinter).transactionHash}`
  );

  /**
   * @dev deploy token migrator and set mariposa allowance
   */

  const tokenMigrator = await (
    (await (
      await ethers.getContractFactory('TokenMigrator')
    ).deploy(
      wxBtrfly,
      xBtrfly,
      btrflyV2.address,
      btrflyAddress,
      mariposa.address,
      staking,
      rlBtrfly.address
    )) as TokenMigrator
  ).deployed();

  console.log(`tokenMigrator: ${tokenMigrator.address}`);

  const totalSupplyOfV1inV2 = toBN(1e18); // !TODO  get correct amount

  const setTokenMigratorAsMinter = await (
    await mariposa.addMinter(tokenMigrator.address)
  ).wait();

  console.log(
    `mariposa: set token migrator as minter: ${setTokenMigratorAsMinter.transactionHash}`
  );

  const increaseAllowanceOfTokenMigrator = await (
    await mariposa.increaseAllowance(tokenMigrator.address, totalSupplyOfV1inV2)
  ).wait();

  console.log(
    `mariposa: set allowance of tokenMigrator: ${increaseAllowanceOfTokenMigrator.transactionHash}`
  );

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

  /**
   * @dev for testing copy paste to test-contracts-state.ts
   */
  console.log(`const btrflyV2Address = '${btrflyV2.address}'`);
  console.log(`const rlBtrflyAddress = '${rlBtrfly.address}'`);
  console.log(`const mariposaAddress = '${mariposa.address}' `);
  console.log(`const tokenMigratorAddress = '${tokenMigrator.address}'`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
