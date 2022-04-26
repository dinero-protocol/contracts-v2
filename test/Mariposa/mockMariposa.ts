import { Signer } from "ethers";
import { ethers, network } from "hardhat";

/**
 * Impersonates the multisig address
 * @returns impersonated ownerSigner
 */
 export async function impersonateSigner(address: string) {
    await network.provider.send('hardhat_impersonateAccount', [address]);

    const signer: Signer = ethers.provider.getSigner(address);

    let balance: string = "0x10000000000000000000000";
    await network.provider.send("hardhat_setBalance", [address, balance, ]);

    return signer;
}

/**
 * Setup and deploy Mariposa contract
 * @param owner_addr 
 * @param btrfly_addr 
 * @param cap_of_tokens 
 * @param duration_of_epoch 
 * @returns Mariposa contract
 */
export async function setupMariposa(
    btrfly_addr: string, 
    cap_of_tokens: string,
    duration_of_epoch: number,
    multisig_addr: string
) {
    // Gets the mariposa contract and deploys
    const mariposaFactory = await ethers.getContractFactory("Mariposa");
    const Mariposa = await mariposaFactory.deploy(
        btrfly_addr,
        cap_of_tokens,
        duration_of_epoch
    ); 
    
    // sets the owner of the Mariposa contract to be the multisig
    await Mariposa.transferOwnership(multisig_addr); 

    // Prints the address of Mariposa contract that has been deployed 
    console.log(`\tDeployed Mariposa contract at ${Mariposa.address}`);
    return Mariposa; 
}

/**
 * Fetches the deployed BTRFLY contract
 * @param btrfly_addr 
 * @param signer 
 * @returns BTRFLYContract 
 */
export async function setupBTRFLY(btrfly_addr: string, signer: Signer){
    const BTRFLYContract = await ethers.getContractAt("BTRFLY", btrfly_addr, signer);
    return BTRFLYContract; 
}


