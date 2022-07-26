import { ethers } from 'hardhat';
import { toBN } from '../test/helpers';
import {
  BTRFLY,
  REDACTEDStaking,
  StakingHelper,
  StakingWarmup,
  Mariposa,
  MockDistributor,
  RLBTRFLY,
  TokenMigrator,
  WxBTRFLY,
  BTRFLYV2,
  IERC20,
  IIncurDebt
} from '../typechain';

async function main() {

    // constants
    // - btrflyv1 
    // - btrflyv2
    // - migrator
    // - mariposa?
    // - OHM address
    // - incur debt contract

    const [deployer] = await ethers.getSigners();

    // ADDRESSES ON GOERLI
    const btrflyV1Address = "";
    const btrflyV2Address = "";
    const ohmAddress = "";
    const incurDebtAddress = "";
    const strategyAddress = "";
    const poolID = "";
    const migratorAddress = "";

    // LP constants
    const btrflyV1Amount = ethers.utils.parseUnits("","gwei");
    const ohmAmount = ethers.utils.parseUnits("","gwei");

    const btrflyV1 = await ethers.getContractAt("BTRFLY",btrflyV1Address) as BTRFLY;
    const btrflyV2 = await ethers.getContractAt("BTRFLYV2",btrflyV2Address) as BTRFLYV2;
    const ohm = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ohmAddress) as IERC20;
    const migrator = await ethers.getContractAt("TokenMigrator",migratorAddress) as TokenMigrator;
    const incurDebt = await ethers.getContractAt("IIncurDebt", incurDebtAddress) as IIncurDebt;
    
    // - have 30.4K BTRFLYv1
    // - migrate 30.4K into V2
    await btrflyV1.approve(migratorAddress,ethers.constants.MaxUint256);
    console.log("v1 btrfly approved");
    await btrflyV2.approve(incurDebtAddress,ethers.constants.MaxUint256);
    console.log("v2 btrfly approved");
    await migrator.migrate(0,0,btrflyV1Amount,deployer.address,false);
    console.log("btrfly migrated");

    const v2Balance = await btrflyV2.balanceOf(deployer.address);

    const stratParams = (ethers.utils.defaultAbiCoder).encode(
        ["bytes32","address[]","uint256[]","uint256"],
        [poolID,[ohmAddress,btrflyV2Address],[ohmAmount,v2Balance],0]
      );

    console.log("Strat params : " + stratParams);

    // - use incur debt to add LP
    await incurDebt.createLP(
      ohmAmount,
      strategyAddress,
      stratParams
    );
    // -- build LP adding Tx
    // -- add LP

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });