import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { toBN } from './helpers';

import { BTRFLYV2 } from '../typechain';

describe('BTRFLYV2', function(){
    let admin: SignerWithAddress;
    let notAdmin: SignerWithAddress;
    let vault: SignerWithAddress;
    let alice: SignerWithAddress;
    let btrflyV2: BTRFLYV2;


    before(async function(){
        
        ({ btrflyV2 } = this);

        [admin, notAdmin, vault, alice] = await ethers.getSigners();

    });

    describe("Intial State", function(){

        it("Should be initialised correctly", async function(){

            const name = await btrflyV2.name();
            const symbol = await btrflyV2.symbol();
            const decimals = await btrflyV2.decimals();
            const totalSupply = await btrflyV2.totalSupply();

            expect(name).to.equal('BTRFLY');
            expect(symbol).to.equal('BTRFLY');
            expect(decimals).to.equal(18);

            //as per setup.ts
            expect(totalSupply).to.equal(toBN(100e18));

        })

    })

    describe("Vault / Minting Functionality", async function(){

        it("Does not allow non-owner address to set vault", async function(){

            await expect( btrflyV2.connect(notAdmin).setVault(notAdmin.address))
            .to.be.revertedWith("Ownable: caller is not the owner");

        })

        it("Allows owner to set vault", async function(){

            await btrflyV2.connect(admin).setVault(vault.address);
            const _vault = await btrflyV2.vault();

            expect(_vault.toLowerCase()).to.equal((vault.address).toLowerCase());

        })

        it("Allows vault to mint tokens", async function(){

            await btrflyV2.connect(admin).setVault(vault.address);
            await btrflyV2.connect(vault).mint(alice.address, toBN(100e18));

            const balance = await btrflyV2.balanceOf(alice.address);
            const totalSupply = await btrflyV2.totalSupply();

            expect(balance).to.equal(toBN(100e18));
            expect(totalSupply).to.equal(toBN(200e18));

        })

        it("Does not allow non-vault address to mint tokens", async function(){

            await expect(btrflyV2.connect(notAdmin).mint(await notAdmin.getAddress(), toBN(100e18)))
            .to.be.revertedWith("NotVault()");

        })

    })

})

