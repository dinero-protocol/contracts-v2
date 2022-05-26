import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { RLBTRFLY, BTRFLY, IERC20, IWXBTRFLY, IStakingHelper, TokenMigrator, MockMariposa, BTRFLYV2 } from '../typechain';
import { toBN, impersonateAddressAndReturnSigner } from './helpers';

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
        // - mint 1000 BTRFLY to holder address
        await btrflyv1.mint(await holder.getAddress(), ethers.utils.parseUnits("1000","gwei"));

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

    describe("WXBTRFLY --> BTRFLYV2", function(){

        describe("To Unlocked BTRFLYV2", function() {

            it("mints an amount of BTRFLYV2 equal to the input WXBTRFLY amount", async function(){
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),balanceWx,false);
                const balanceV2 = await btrflyv2.balanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceV2).to.equal(balanceWx);
                expect(supplyV2).to.equal(balanceWx);
            })

            it("mints BTRFLYV2 to the right address", async function(){
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromWXBTRFLY(await receiver.getAddress(),balanceWx,false);
                const balanceV2Receiver = await btrflyv2.balanceOf(await receiver.getAddress());
    
                expect(balanceV2Receiver).to.equal(balanceWx);
            })

            it("burns BTRFLYV1 tokens", async function(){
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
                await tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),balanceWx,false);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost.div(toBN(10)))
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))).div(toBN(10)));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost.div(toBN(10)))
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))).div(toBN(10)));
    
            })

            it("reverts when user balance is insufficient", async function(){

                await expect(tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),ethers.utils.parseEther("1"),false))
                .to.be.revertedWith("");
    
            })

        })

        describe("To rlBTRFLY", function() {

            it("mints & rLocks an amount of BTRFLYV2 equal to the input WXBTRFLY amount", async function(){
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),balanceWx,true);
                const balanceRL = await rlBtrfly.lockedBalanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceRL).to.equal(balanceWx);
                expect(supplyV2).to.equal(balanceWx);
            })

            it("mints & rLocks BTRFLYV2 to the right address", async function(){
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromWXBTRFLY(await receiver.getAddress(),balanceWx,true);
                const balanceRLReceiver = await rlBtrfly.lockedBalanceOf(await receiver.getAddress());
    
                expect(balanceRLReceiver).to.equal(balanceWx);
            })

            it("burns BTRFLYV1 tokens", async function(){
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await wxbtrfly.connect(holder).wrapFromBTRFLY(ethers.utils.parseUnits("1000","gwei"));
                const balanceWx = await wxbtrfly.balanceOf(await holder.getAddress());
                await tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),balanceWx,true);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost.div(toBN(10)))
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))).div(toBN(10)));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost.div(toBN(10)))
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))).div(toBN(10)));
    
            })

            it("reverts when user balance is insufficient", async function(){

                await expect(tokenMigrator.connect(holder).fromWXBTRFLY(await holder.getAddress(),ethers.utils.parseEther("1"),true))
                .to.be.revertedWith("");
    
            })

        })

    })

    describe("XBTRFLY --> BTRFLYV2", function(){

        describe("To Unlocked BTRFLYV2", function() {

            it("mints an amount of BTRFLYV2 equal to the input XBTRFLY amount", async function(){
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                const valueWx = (await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei")));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
                const balanceV2 = await btrflyv2.balanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceV2).to.equal(valueWx);
                expect(supplyV2).to.equal(valueWx);
            })
    
            it("mints BTRFLYV2 to the right address", async function(){
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await receiver.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
                const balanceV2Receiver = await btrflyv2.balanceOf(await receiver.getAddress());
    
                expect(balanceV2Receiver).to.equal(valueWx);
            })
    
            it("burns BTRFLYV1 tokens", async function(){
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost)
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost)
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))));
            })
    
            it("reverts when user balance is insufficient", async function() {
                await expect(tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),ethers.utils.parseUnits("1000","gwei"),false))
                .to.be.revertedWith("");
            })

        })

        describe("To rlBTRFLY", function() {

            it("mints & rLocks an amount of BTRFLYV2 equal to the input XBTRFLY amount", async function(){
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                const valueWx = (await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei")));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
                const balanceRL = await rlBtrfly.lockedBalanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceRL).to.equal(valueWx);
                expect(supplyV2).to.equal(valueWx);
            })
    
            it("mints & rLocks BTRFLYV2 to the right address", async function(){
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await receiver.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
                const balanceRLReceiver = await rlBtrfly.lockedBalanceOf(await receiver.getAddress());
    
                expect(balanceRLReceiver).to.equal(valueWx);
            })
    
            it("burns BTRFLYV1 tokens", async function(){
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await stakingHelper.connect(holder).stake(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost)
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost)
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))));
            })
    
            it("reverts when user balance is insufficient", async function() {
                await expect(tokenMigrator.connect(holder).fromXBTRFLY(await holder.getAddress(),ethers.utils.parseUnits("1000","gwei"),true))
                .to.be.revertedWith("");
            })

        })

})

    describe("BTRFLYV1 --> BTRFLYV2", async function(){

        describe("To Unlocked BTRFLYV2", function(){

            it("mints an amount of BTRFLYV2 equal to the input XBTRFLY amount", async function(){

                const valueWx = (await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei")));
    
                await tokenMigrator.connect(holder).fromBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
                const balanceV2 = await btrflyv2.balanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceV2).to.equal(valueWx);
                expect(supplyV2).to.equal(valueWx);
            })
    
            it("mints BTRFLYV2 to the right address", async function(){
    
                const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromBTRFLY(await receiver.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
                const balanceV2Receiver = await btrflyv2.balanceOf(await receiver.getAddress());
    
                expect(balanceV2Receiver).to.equal(valueWx);
            })
    
            it("burns BTRFLYV1 tokens", async function(){
    
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),false);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost)
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost)
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
            })
    
            it("reverts when user balance is insufficient", async function() {
                await expect(tokenMigrator.connect(receiver).fromBTRFLY(await receiver.getAddress(),ethers.utils.parseUnits("1000","gwei"),false))
                .to.be.revertedWith("");
            })

        })

        describe("To rlBTRFLY", function(){

            it("mints & rLocks an amount of BTRFLYV2 equal to the input XBTRFLY amount", async function(){

                const valueWx = (await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei")));
    
                await tokenMigrator.connect(holder).fromBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
                const balanceRL = await rlBtrfly.lockedBalanceOf(await holder.getAddress());
                const supplyV2 = await btrflyv2.totalSupply();
    
                expect(balanceRL).to.equal(valueWx);
                expect(supplyV2).to.equal(valueWx);
            })
    
            it("mints & rLocks BTRFLYV2 to the right address", async function(){
    
                const valueWx = await wxbtrfly.wBTRFLYValue(ethers.utils.parseUnits("1000","gwei"));
    
                await tokenMigrator.connect(holder).fromBTRFLY(await receiver.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
                const balanceRLReceiver = await rlBtrfly.lockedBalanceOf(await receiver.getAddress());
    
                expect(balanceRLReceiver).to.equal(valueWx);
            })
    
            it("burns BTRFLYV1 tokens", async function(){
    
                const totalV1SupplyPre = await btrflyv1.totalSupply();
                const holderV1BalancePre = await btrflyv1.balanceOf(await holder.getAddress());
    
                await tokenMigrator.connect(holder).fromBTRFLY(await holder.getAddress(),(ethers.utils.parseUnits("1000","gwei")),true);
    
                const totalV1SupplyPost = await btrflyv1.totalSupply();
    
                const holderV1BalancePost = await btrflyv1.balanceOf(await holder.getAddress());
                const tokenMigratorV1Balance = await btrflyv1.balanceOf(tokenMigrator.address);
    
                expect(holderV1BalancePost)
                .to.equal((holderV1BalancePre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
                expect(tokenMigratorV1Balance).to.equal(toBN(0));
    
                expect(totalV1SupplyPost)
                .to.equal((totalV1SupplyPre.sub(ethers.utils.parseUnits("1000","gwei"))));
    
            })
    
            it("reverts when user balance is insufficient", async function() {
                await expect(tokenMigrator.connect(receiver).fromBTRFLY(await receiver.getAddress(),ethers.utils.parseUnits("1000","gwei"),true))
                .to.be.revertedWith("");
            })

        })

    })

})