import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { RLBTRFLY, BTRFLY, IERC20, IWXBTRFLY, IStakingHelper, TokenMigrator, MockMariposa, BTRFLYV2 } from '../typechain';
import { toBN, impersonateAddressAndReturnSigner, callAndReturnEvent, validateEvent } from './helpers';

describe('Token Migrator', function () {
    const BTRFLYV1ADDRESS = "0xc0d4ceb216b3ba9c3701b291766fdcba977cec3a";
    const XBTRFLYADDRESS = "0xCC94Faf235cC5D3Bf4bEd3a30db5984306c86aBC";
    const WXBTRFLYADDRESS = "0x4B16d95dDF1AE4Fe8227ed7B7E80CF13275e61c9";
    const STAKINGADDRESS = "0xbde4dfb0dbb0dd8833efb6c5bd0ce048c852c487";
    const STAKINGHELPERADDRESS = "0xC0840Ec5527d3e70d66AE6575642916F3Fd18aDf";
    const DAOADDRESS = "0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e";

    let admin : SignerWithAddress;
    let dao : SignerWithAddress;

    let holder : SignerWithAddress;
    let receiver : SignerWithAddress;

    let btrflyv1 : BTRFLY;
    let btrflyv2 : BTRFLYV2;
    let xbtrfly : IERC20;
    let wxbtrfly : IWXBTRFLY;

    let stakingHelper : IStakingHelper;
    let mariposa : MockMariposa;
    let rlBtrfly : RLBTRFLY;
    let tokenMigrator : TokenMigrator;

    beforeEach( async function(){

        [admin,holder,receiver] = await ethers.getSigners();

        btrflyv2 = await (await ethers.getContractFactory("BTRFLYV2")).deploy() as BTRFLYV2;
        mariposa = await (await ethers.getContractFactory("MockMariposa")).deploy(btrflyv2.address) as MockMariposa;
        await btrflyv2.setVault(mariposa.address);

        rlBtrfly = await (await ethers.getContractFactory("RLBTRFLY")).deploy(btrflyv2.address) as RLBTRFLY;

        tokenMigrator = await (await ethers.getContractFactory("TokenMigrator")).deploy(
            WXBTRFLYADDRESS,
            XBTRFLYADDRESS,
            btrflyv2.address,
            BTRFLYV1ADDRESS,
            mariposa.address,
            STAKINGADDRESS,
            rlBtrfly.address
        ) as TokenMigrator;

        // - impersonate dao
        dao = await impersonateAddressAndReturnSigner(admin,DAOADDRESS);

        // - fetch btrflyv1 token
        btrflyv1 = await ethers.getContractAt("BTRFLY",BTRFLYV1ADDRESS,dao) as BTRFLY;
        // - set vault to admin address
        await btrflyv1.setVault(DAOADDRESS);

        // - fetch wxbtrfly
        wxbtrfly = await ethers.getContractAt("IWXBTRFLY",WXBTRFLYADDRESS) as IWXBTRFLY;
        
        // - fetch xbtrfly
        xbtrfly = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",XBTRFLYADDRESS) as IERC20;

        // - fetch staking helper contract
        stakingHelper = await ethers.getContractAt("IStakingHelper",STAKINGHELPERADDRESS) as IStakingHelper;

        // - blanket approvals for all contracts
        await btrflyv1.connect(holder).approve(wxbtrfly.address,ethers.constants.MaxUint256);
        await btrflyv1.connect(holder).approve(stakingHelper.address,ethers.constants.MaxUint256);
        await btrflyv1.connect(holder).approve(tokenMigrator.address,ethers.constants.MaxUint256);
        await xbtrfly.connect(holder).approve(tokenMigrator.address,ethers.constants.MaxUint256);
        await wxbtrfly.connect(holder).approve(tokenMigrator.address,ethers.constants.MaxUint256);

    })

    describe("constructor", function(){

        it("Initialises contract state correctly", async function(){

            const _wxbtrflyAddress = await tokenMigrator.wxbtrfly();
            const _xbtrflyAddress = await tokenMigrator.xbtrfly();
            const _btrflyv1Address = await tokenMigrator.btrflyv1();
            const _mariposaAddress = await tokenMigrator.mariposa();
            const _stakingAddress = await tokenMigrator.staking();

            expect(_wxbtrflyAddress.toLowerCase()).to.equal(WXBTRFLYADDRESS.toLowerCase());
            expect(_xbtrflyAddress.toLowerCase()).to.equal(XBTRFLYADDRESS.toLowerCase());
            expect(_btrflyv1Address.toLowerCase()).to.equal(BTRFLYV1ADDRESS.toLowerCase());
            expect(_mariposaAddress.toLowerCase()).to.equal(mariposa.address.toLowerCase());
            expect(_stakingAddress.toLowerCase()).to.equal(STAKINGADDRESS.toLowerCase());

        })

    })

    describe("Handling of Invalid Parameters", function(){

        it("Reverts with ZeroAddress() when recipient is entered as 0x00...0", async function(){

            await expect(
                tokenMigrator.migrate(
                    ethers.utils.parseUnits("10","ether"),
                    ethers.utils.parseUnits("10","gwei"),
                    ethers.utils.parseUnits("10","gwei"),
                    ethers.constants.AddressZero,
                    false
            )
            ).to.be.revertedWith("ZeroAddress()");

        })

        it("Reverts with ZeroAmount() when all amounts to migrate are 0", async function(){

            await expect(
                tokenMigrator.migrate(
                    "0",
                    "0",
                    "0",
                    holder.address,
                    false
            )
            ).to.be.revertedWith("ZeroAmount()");

        })

    })

    describe("WXBTRFLY --> BTRFLYV2", function(){

        it("Returns the correct migrated value", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
            const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());

            const migrateEvent = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    balanceWx,
                    "0",
                    "0",
                    holderAddress,
                    false
                ]
            );

            await validateEvent(migrateEvent,"Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : balanceWx
            });

        })

        it("Reverts when user balance is insufficient", async function(){

            await expect(tokenMigrator.connect(holder).migrate(
                ethers.utils.parseUnits("1","ether"),
                "0",
                "0",
                holder.address,
                false
            ))
            .to.be.revertedWith("");

        })

        it("Decrements user's WXBTRFLY balance", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
            const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());

            await tokenMigrator.connect(holder).migrate(
                balanceWx,
                "0",
                "0",
                holderAddress,
                false
            );

            expect(await wxbtrfly.balanceOf(holderAddress)).to.equal(toBN(0));

        })

    })

    describe("XBTRFLY --> BTRFLYV2", function(){

        it("Returns the correct migrated value", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
            const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            const migrateEvent = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    "0",
                    ethers.utils.parseUnits("1000","gwei"),
                    "0",
                    holderAddress,
                    false
                ]
            );

            await validateEvent(migrateEvent, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWx
            });

        })

        it("Reverts when user balance is insufficient", async function(){

            await expect(tokenMigrator.connect(holder).migrate(
                "0",
                ethers.utils.parseUnits("1","gwei"),
                "0",
                holder.address,
                false
            ))
            .to.be.revertedWith("");

        })

        it("Decrements user's XBTRFLY balance", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
            await tokenMigrator.connect(holder).migrate(
                "0",
                ethers.utils.parseUnits("1000","gwei"),
                "0",
                holder.address,
                false
            );

            expect(await xbtrfly.balanceOf(holderAddress)).to.equal(toBN(0));

        })

    })

    describe("BTRFLYV1 --> BTRFLYV2", async function(){

        it("Returns the correct migrated value", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
            const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            const migrateEvent = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    "0",
                    "0",
                    ethers.utils.parseUnits("1000","gwei"),
                    holderAddress,
                    false
                ]
            );

            await validateEvent(migrateEvent, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWx
            });

        })

        it("Reverts when user balance is insufficient", async function(){

            await expect(tokenMigrator.connect(receiver).migrate(
                "0",
                "0",
                ethers.utils.parseUnits("1","gwei"),
                holder.address,
                false
            ))
            .to.be.revertedWith("");

        })

        it("Decrements user's BTRFLYV1 balance", async function(){

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("1000","gwei"));
    
            await tokenMigrator.connect(holder).migrate(
                "0",
                "0",
                ethers.utils.parseUnits("1000","gwei"),
                holderAddress,
                false
            );

            const holderV1BalancePost = await btrflyv1.balanceOf(holderAddress);

            expect(holderV1BalancePost).to.equal(toBN(0));

        })

    })

    describe("Multiple Token Migration", async function(){

        it("Returns correct value for all multiple token migration permutations", async function(){
            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("9000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("3000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("3000","gwei"));
            const valueWxBase = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            const migrateEvent111 = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    ethers.utils.parseUnits("1000","gwei"),
                    ethers.utils.parseUnits("1000","gwei"),
                    holderAddress,
                    false
                ]
            );

            const migrateEvent110 = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    ethers.utils.parseUnits("1000","gwei"),
                    0,
                    holderAddress,
                    false
                ]
            );

            const migrateEvent101 = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    0,
                    ethers.utils.parseUnits("1000","gwei"),
                    holderAddress,
                    false
                ]
            );

            const migrateEvent011 = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    0,
                    ethers.utils.parseUnits("1000","gwei"),
                    ethers.utils.parseUnits("1000","gwei"),
                    holderAddress,
                    false
                ]
            );

            await validateEvent(migrateEvent111, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWxBase.mul(toBN(3))
            });

            await validateEvent(migrateEvent110, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWxBase.mul(toBN(2))
            });

            await validateEvent(migrateEvent101, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWxBase.mul(toBN(2))
            });

            await validateEvent(migrateEvent011, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : false,
                value : valueWxBase.mul(toBN(2))
            });

        })

    })

    describe("Minting BTRFLYV2", function(){

        it("Mints amount equal to value returned by function", async function(){
            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("3000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
            const valueWxBase = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            await tokenMigrator.connect(holder).migrate(
                valueWxBase,
                ethers.utils.parseUnits("1000","gwei"),
                ethers.utils.parseUnits("1000","gwei"),
                holderAddress,
                false
            );

            expect(await btrflyv2.balanceOf(holderAddress)).to.equal(valueWxBase.mul(toBN(3)));
        })

        it("Mints tokens to correct recipient", async function(){
            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("3000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
            const valueWxBase = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            const migrateEvent111 = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    ethers.utils.parseUnits("1000","gwei"),
                    ethers.utils.parseUnits("1000","gwei"),
                    receiver.address,
                    false
                ]
            );

            await validateEvent(migrateEvent111, "Migrate(address,address,bool,uint256)",{
                to : receiver.address,
                from : holderAddress,
                rl : false,
                value : valueWxBase.mul(toBN(3))
            });

            expect(await btrflyv2.balanceOf(receiver.address)).to.equal(valueWxBase.mul(toBN(3)));
        })

        it("Burns BTRFLYV1 Tokens", async function(){
            const btrflyV1SupplyPre = await btrflyv1.totalSupply();

            const holderAddress = holder.address;
            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("3000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
            const valueWxBase = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            await tokenMigrator.connect(holder).migrate(
                valueWxBase,
                ethers.utils.parseUnits("1000","gwei"),
                ethers.utils.parseUnits("1000","gwei"),
                receiver.address,
                false
            );

            expect((await btrflyv1.totalSupply()).div(toBN(10))).to.equal(btrflyV1SupplyPre.div(toBN(10)));
            expect(await btrflyv1.balanceOf(tokenMigrator.address)).to.equal(toBN(0));
        })

        it("Locks tokens when rl is set to True", async function(){
            const holderAddress = holder.address;
            expect(await rlBtrfly.lockedBalanceOf(holderAddress)).to.equal(toBN(0));
            expect(await rlBtrfly.lockedBalanceOf(receiver.address)).to.equal(toBN(0));

            await btrflyv1.mint(holderAddress, ethers.utils.parseUnits("6000","gwei"));
            await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("2000","gwei"));
            await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("2000","gwei"));
            const valueWxBase = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));

            const migrateEventToHolder = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    ethers.utils.parseUnits("1000","gwei"),
                    ethers.utils.parseUnits("1000","gwei"),
                    holderAddress,
                    true
                ]
            );

            await validateEvent(migrateEventToHolder, "Migrate(address,address,bool,uint256)",{
                to : holderAddress,
                from : holderAddress,
                rl : true,
                value : valueWxBase.mul(toBN(3))
            });

            expect(await rlBtrfly.lockedBalanceOf(holderAddress)).to.equal(valueWxBase.mul(toBN(3)));

            const migrateEventToReceiver = await callAndReturnEvent(
                tokenMigrator.connect(holder).migrate,
                [
                    valueWxBase,
                    ethers.utils.parseUnits("1000","gwei"),
                    ethers.utils.parseUnits("1000","gwei"),
                    receiver.address,
                    true
                ]
            );

            await validateEvent(migrateEventToReceiver, "Migrate(address,address,bool,uint256)",{
                to : receiver.address,
                from : holderAddress,
                rl : true,
                value : valueWxBase.mul(toBN(3))
            });

            expect(await rlBtrfly.lockedBalanceOf(receiver.address)).to.equal(valueWxBase.mul(toBN(3)));
        })

    })

})