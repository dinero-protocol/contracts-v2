/*

    Test setup :
    
    use hardhat mainnet forking to :
    - deploy mariposa with a cap of 5M
    - immitate dao multisig 0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e
    - call setVault(mariposaAddress) on the btrfly contract

    tests to ensure
    - distributions are correct
    - adjustments are correct
    - requests update department budgets correctly
    - ensure unauthorised accounts CANNOT mint

*/

import { Contract, Signer } from "ethers";
import { vaultIsMariposa } from "./its";
import { impersonateSigner, setupMariposa, setupBTRFLY } from "./mocks/mockMariposa";

export function MariposaTest(): void {

    let Mariposa: Contract; 
    let BTRFLY: Contract;

    let multisig_addr: string;
    const btrfly = "0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A";
    const cap = "5000000000000000000000000";                              // in wei 
    const duration_of_epoch = 3600 * 8;                                   // 8 hours 

    let multisigSigner: Signer;

    describe( "Tests for Mariposa", async() => {

        before(async () => {
            
            // Impersonated multisig address 
            multisigSigner = await impersonateSigner();
            multisig_addr = await multisigSigner.getAddress(); 

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
            await BTRFLY.connect(multisigSigner).setVault(Mariposa.address); 

                      
        }); 

        it("Confirm that the vault of the BTRFLY Contract is Mariposa", async function() {
            await vaultIsMariposa(BTRFLY, multisigSigner, Mariposa.address);
        })

    });

}

MariposaTest()


