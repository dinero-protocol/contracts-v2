import { Contract, Signer } from "ethers";
import { ethers, network } from "hardhat";


/**
 * Impersonates the multisig address
 * @returns impersonated ownerSigner
 */
 export async function impersonateSigner() :Promise<Signer> {
    const ownerAddr = "0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e";
    await network.provider.send('hardhat_impersonateAccount', [ownerAddr]);

    const ownerSigner: Signer = ethers.provider.getSigner(ownerAddr);
    // const owner_addr = await ownerSigner.getAddress();

    // let balance: string = "0x10000000000000000000000";
    // await network.provider.send("hardhat_setBalance", [owner_addr, balance, ]);

    return ownerSigner;
}

/**
 * 
 * @param owner_addr Setup and deploy Mariposa contract
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
) :Promise<Contract>{


    // Gets the mariposa contract and deploys
    const mariposaFactory = await ethers.getContractFactory("Mariposa");
   const Mariposa = await mariposaFactory.deploy(
        btrfly_addr,
        cap_of_tokens,
        duration_of_epoch
    ); 
    
    // sets the owner of the Mariposa contract to be the multisig
    await Mariposa.connect(Mariposa.address).transferOwnership(multisig_addr); 

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
export async function setupBTRFLY(btrfly_addr: string, signer: Signer): Promise<Contract>{
    const BTRFLYContract = await ethers.getContractAt("BTRFLY", btrfly_addr, signer);
    return BTRFLYContract; 
}