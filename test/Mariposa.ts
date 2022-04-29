/*

    Test setup :
    
    use hardhat mainnet forking to :
    - deploy mariposa with a cap of 5M
    - immitate dao multisig 0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e
    - call setVault(mariposaAddress) on the btrfly contract

    tests to ensure
    - check that we can't set a department address for a department that doesn't exist
    - distributions are correct
    - adjustments are correct
    - requests update department budgets correctly
    - ensure unauthorised accounts CANNOT mint

*/

import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { addDepartments, departmentRequests, epochDistributions, mintBTRFLY, setDepartmentAddress, setDepartmentAdjustment, setExtraDepartment, totalEmissions, updateDistributions, updateMint, vaultIsMariposa } from "./Mariposa/its";
import { impersonateSigner, setupMariposa, setupBTRFLY } from "./Mariposa/mockMariposa";

export function MariposaTest(): void {

    let Mariposa: Contract; 
    let BTRFLY: Contract;

    let multisigSigner: Signer;
    let mariposaSigner: Signer; 
    let department1Signer: Signer;
    let department2Signer: Signer;
    let walletSigner: Signer; 
    let signers: Signer[];

    let mariposa_addr: string; 
    let department1_addr: string;
    let department2_addr: string;
    let wallet_addr: string;
    const multisig_addr = "0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e";

    const btrfly = "0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A";
    const cap = "5000000000000000000000000";                                 // in wei 
    const duration_of_epoch = 3600 * 8;                                   // 8 hours 
    const txnAmt = "7000000000000000000";

    describe( "Tests for Mariposa", async() => {

        before(async () => {
            
            // Impersonate multisig signer 
            multisigSigner = await impersonateSigner(multisig_addr);

            // Get department signers and addresses
            signers = await ethers.getSigners();
            department1Signer = signers[0];
            department2Signer = signers[1];
            walletSigner = signers[2];

            department1_addr = await department1Signer.getAddress();
            department2_addr =  await department2Signer.getAddress(); 
            wallet_addr = await walletSigner.getAddress();

            /** Connect to existing BTRFLY Contract **/
            BTRFLY = await setupBTRFLY(
                btrfly,
                multisigSigner
            );

            /** Mariposa Mock **/
            Mariposa = await setupMariposa(
                btrfly,
                cap,
                duration_of_epoch,
                multisig_addr
            );
            
            /** Set Vault of BTRFLY Contract to Mariposa **/
            mariposa_addr = Mariposa.address; 
            await BTRFLY.connect(multisigSigner).setVault(mariposa_addr); 

            // Impersonate mariposa signer 
            mariposaSigner = await impersonateSigner(mariposa_addr); 
      
        }); 

        it("Confirm that the vault of the BTRFLY Contract is Mariposa", async function() {
            await vaultIsMariposa(BTRFLY, multisigSigner, Mariposa.address);
        })

        it("Should ensure that only Mariposa has the ability to mint BTRFLY tokens", async function() {
            await mintBTRFLY(BTRFLY, multisigSigner, mariposaSigner, wallet_addr, txnAmt);
        })
        
        it("Adds departments that report to Mariposa for minting tokens", async function() {
            await addDepartments(Mariposa, multisigSigner);
        })

        it("Sets the address of a department", async function () {
            await setDepartmentAddress(Mariposa, multisigSigner, department1_addr, department2_addr);
        })

        it("Checks that we cannot set a department address for a department that doesn't exist", async function () {
            await setExtraDepartment(Mariposa, multisigSigner, department1_addr);
        })

        it("Should update the mint rate of each department accordingly", async function () {
            await setDepartmentAdjustment(Mariposa, multisigSigner);
        })

        it("Should give the total number of tokens to be added to the departments next epoch", async function () {
            await totalEmissions(Mariposa);
        })

        it("Call distribute updating the respective fields", async function () {
            await updateDistributions(Mariposa);
        })

        it("Checks we aren't calling the distribute function more than once per epoch", async function () {
            await epochDistributions(Mariposa);
        })

        it("Should check that requests update department budgets correctly", async function () {
            await departmentRequests(Mariposa, BTRFLY, department1_addr, department2_addr,department1Signer, department2Signer);
        })

        it("Should update the mint rate of an existing department and ensure we don't exceed the cap", async function () {
            await updateMint(Mariposa, multisigSigner, cap);
        })

    });
}

MariposaTest();


