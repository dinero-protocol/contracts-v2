import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { toBN } from './helpers';

import { BTRFLYV2 } from '../typechain';

describe('BTRFLYV2', function(){
    let admin: SignerWithAddress;
    let notAdmin: SignerWithAddress;
    let vault: SignerWithAddress;
    let btrflyv2: BTRFLYV2;


    before(async function(){
        
        ({ btrflyv2 } = this);

        [admin, notAdmin, vault] = await ethers.getSigners();

    });

    describe("Intial State", function(){

        it("Should be initialised correctly", async function(){

            const name = await btrflyv2.name();
            const symbol = await btrflyv2.symbol();
            const decimals = await btrflyv2.decimals();
            const totalSupply = await btrflyv2.totalSupply();

            expect(name).to.equal('BTRFLY');
            expect(symbol).to.equal('BTRFLY');
            expect(decimals).to.equal(18);

            //as per setup.ts
            expect(totalSupply).to.equal(toBN(100e18));

        })

    })

    describe("Vault / Minting Functionality", async function(){

        it("Does not allow non-owner address to set vault", async function(){

            await expect( btrflyv2.connect(notAdmin).setVault(await notAdmin.getAddress() ))
            .to.be.revertedWith("Ownable: caller is not the owner");

        })

        it("Allows owner to set vault", async function(){

            await btrflyv2.connect(admin).setVault(await vault.getAddress());
            const _vault = await btrflyv2.vault();

            expect(_vault.toLowerCase()).to.equal((await vault.getAddress()).toLowerCase());

        })

        it("Allows vault to mint tokens", async function(){

            await btrflyv2.connect(admin).setVault(await vault.getAddress());
            await btrflyv2.connect(vault).mint(await notAdmin.getAddress(), toBN(100e18));

            const balance = await btrflyv2.balanceOf(await notAdmin.getAddress());
            const totalSupply = await btrflyv2.totalSupply();

            expect(balance).to.equal(toBN(100e18));
            expect(totalSupply).to.equal(toBN(200e18));

        })

        it("Does not allow non-vault address to mint tokens", async function(){

            await expect(btrflyv2.connect(notAdmin).mint(await notAdmin.getAddress(), toBN(100e18)))
            .to.be.revertedWith("NotVault()");

        })

    })

})

