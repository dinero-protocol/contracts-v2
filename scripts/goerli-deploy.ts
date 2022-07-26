import { ethers } from 'hardhat';
import { toBN } from '../test/helpers';
import {
  BTRFLY,
  XBTRFLY,
  REDACTEDStaking,
  StakingHelper,
  StakingWarmup,
  Mariposa,
  MockDistributor,
  RLBTRFLY,
  TokenMigrator,
  WxBTRFLY,
} from '../typechain';
import { BTRFLYV2 } from '../typechain/BTRFLYV2';

async function main() {
  // constants (to roughly approximate setup as of block #15135426)
  const initialMintAmount = ethers.utils.parseUnits('450000', 'gwei');
  const stakeAmount = ethers.utils.parseUnits('100000', 'gwei');
  const rebaseAmount = ethers.utils.parseUnits('650000', 'gwei');

  const totalSupplyOfV1inV2 = ethers.utils.parseEther(toBN(147e4).toString());
  const mariposaCap = ethers.utils.parseEther(toBN(654e4).toString());

  const [deployer] = await ethers.getSigners();

  // deploy V1

  const btrfly = (await (
    await ethers.getContractFactory('BTRFLY')
  ).deploy()) as BTRFLY;

  console.log(`btrflyV1 token: ${btrfly.address}`);

  const unfreezeBTRFLYV1 = await (await btrfly.unFreezeToken()).wait();

  console.log(`btrflyV1 unfrozen: ${unfreezeBTRFLYV1.transactionHash}`);

  const xbtrfly = (await (
    await ethers.getContractFactory('xBTRFLY')
  ).deploy()) as XBTRFLY;

  console.log(`xbtrfly token: ${xbtrfly.address}`);

  const unfreezeXBTRFLY = await (await xbtrfly.unFreezeToken()).wait();

  console.log(`xbtrfly unfrozen: ${unfreezeXBTRFLY.transactionHash}`);

  const staking = (await (
    await ethers.getContractFactory('REDACTEDStaking')
  ).deploy(
    btrfly.address,
    xbtrfly.address,
    '1',
    '0',
    await ethers.provider.getBlockNumber()
  )) as REDACTEDStaking;

  console.log(`staking: ${staking.address}`);

  const initXbtrfly = await (await xbtrfly.initialize(staking.address)).wait();

  console.log(`xbtrfly initialised: ${initXbtrfly.transactionHash}`);

  const stakingWarmup = (await (
    await ethers.getContractFactory('StakingWarmup')
  ).deploy(staking.address, xbtrfly.address)) as StakingWarmup;

  console.log(`stakingWarmup: ${stakingWarmup.address}`);

  const stakingHelper = (await (
    await ethers.getContractFactory('StakingHelper')
  ).deploy(staking.address, btrfly.address)) as StakingHelper;

  console.log(`stakingHelper: ${stakingHelper.address}`);

  const mockDistributor = (await (
    await ethers.getContractFactory('MockDistributor')
  ).deploy(btrfly.address)) as MockDistributor;

  console.log(`mockDistributor: ${mockDistributor.address}`);

  const wxbtrfly = (await (
    await ethers.getContractFactory('wxBTRFLY')
  ).deploy(staking.address, btrfly.address, xbtrfly.address)) as WxBTRFLY;

  console.log(`wxbtrfly: ${wxbtrfly.address}`);

  const setWarmup = await (
    await staking.setContract(1, stakingWarmup.address)
  ).wait();
  console.log(
    `warmup address set in staking contract: ${setWarmup.transactionHash}`
  );

  // -- set signer as vault
  const setBtrflyV1Vault = await (
    await btrfly.setVault(deployer.address)
  ).wait();
  await btrfly.mint(deployer.address, initialMintAmount);
  console.log(
    `initial btrfly tokens minted: ${setBtrflyV1Vault.transactionHash}`
  );

  // -- deposit btrfly into staking contract
  const btrflyApprove = await (
    await btrfly.approve(stakingHelper.address, ethers.constants.MaxUint256)
  ).wait();
  console.log(
    `deployer approved stakinghelper contract: ${btrflyApprove.transactionHash}`
  );
  const stake = await (await stakingHelper.stake(stakeAmount)).wait();
  console.log(`btrfly tokens staked: ${stake.transactionHash}`);

  // -- set up rebase
  const setBtrflyV1Vault2 = await (
    await btrfly.setVault(mockDistributor.address)
  ).wait();
  console.log(
    `mockDistributor set btrflyv1 vault: ${setBtrflyV1Vault2.transactionHash}`
  );
  const setDistributor = await (
    await staking.setContract(0, mockDistributor.address)
  ).wait();
  console.log(
    `mockDistributor linked to staking contract: ${setDistributor.transactionHash}`
  );
  const setMint = await (
    await mockDistributor.setMint(staking.address, rebaseAmount)
  ).wait();
  console.log(
    `mint programmed into mockDistributor: ${setMint.transactionHash}`
  );
  const rebase0 = await (await staking.rebase()).wait();
  console.log(`rebase0 triggered: ${rebase0.transactionHash}`);
  const setDistributorToZero = await (
    await staking.setContract(0, ethers.constants.AddressZero)
  ).wait();
  console.log(
    `mockDistributor unlinked to staking contract: ${setDistributorToZero.transactionHash}`
  );
  const rebase1 = await (await staking.rebase()).wait();
  console.log(`rebase1 triggered: ${rebase1.transactionHash}`);
  const xbtrflyApprove = await (
    await xbtrfly.approve(staking.address, ethers.constants.MaxUint256)
  ).wait();
  console.log(
    `deployer approved staking contract: ${xbtrflyApprove.transactionHash}`
  );
  const unstake = await (
    await staking.unstake(await xbtrfly.balanceOf(deployer.address), false)
  ).wait();
  console.log(`btrfly unstaked: ${unstake.transactionHash}`);

  // deploy V2

  const btrflyV2 = (await (
    await ethers.getContractFactory('BTRFLYV2')
  ).deploy()) as BTRFLYV2;

  console.log(`btrflyV2 token: ${btrflyV2.address}`);

  const rlBtrfly = (await (
    await ethers.getContractFactory('MockRLBTRFLY')
  ).deploy(btrflyV2.address)) as RLBTRFLY;

  console.log(`rlBtrfly: ${rlBtrfly.address}`);

  const mariposa = (await (
    await ethers.getContractFactory('Mariposa')
  ).deploy(btrflyV2.address, mariposaCap)) as Mariposa;

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

  const tokenMigrator = (await (
    await ethers.getContractFactory('TokenMigrator')
  ).deploy(
    wxbtrfly.address,
    xbtrfly.address,
    btrflyV2.address,
    btrfly.address,
    mariposa.address,
    staking.address,
    rlBtrfly.address
  )) as TokenMigrator;

  console.log(`tokenMigrator: ${tokenMigrator.address}`);

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
