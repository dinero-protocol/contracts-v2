import {expect} from "chai";
import { Contract, Signer } from "ethers";
const hre = require("hardhat");

/**
 * Checks that the vault for BTRFLY is Mariposa
 * @param BTRFLY 
 * @param signer 
 * @param Mariposa_addr 
 */
export async function vaultIsMariposa(BTRFLY: Contract, multisigSigner: Signer, Mariposa_addr: string){
    const vault_addr = await BTRFLY.connect(multisigSigner).vault(); 
    expect(vault_addr).to.be.equals(Mariposa_addr); 
}

/**
 * Ensures that only Mariposa has the ability to mint btrfly tokens
 * @param BTRFLY 
 * @param multisigSigner 
 * @param mariposaSigner 
 * @param walletAddr 
 * @param txnAmt 
 */
export async function mintBTRFLY(
    BTRFLY: Contract, 
    multisigSigner: Signer, 
    mariposaSigner: Signer, 
    walletAddr: string,
    txnAmt: string
) {
    const balBefore = await BTRFLY.balanceOf(walletAddr);
    console.log(`\tThe balance of the wallet before minting the tokens is ${balBefore}`);
    try {
        await BTRFLY.connect(multisigSigner).mint(walletAddr, txnAmt);    
    }
    catch (Error)
    {
        console.log(`\tWhen vault is set to the multisig tokens are not minted.`);
        await BTRFLY.connect(mariposaSigner).mint(walletAddr, txnAmt);
    }
    const balAfter = await BTRFLY.balanceOf(walletAddr); 
    console.log(`\tThe balance of the wallet after minting with vault set as Mariposa is ${balAfter}`);

    expect(balBefore).to.be.lt(balAfter);
    expect(balAfter).to.be.equals(txnAmt);
}

/**
 * Adds departments that sends requests to mint btrfly tokens
 * @param Mariposa 
 * @param multisigSigner 
 */
export async function addDepartments(
    Mariposa: Contract, 
    multisigSigner: Signer, 
    ) {
    let count1 = await Mariposa.departmentCount();

    // adds a department in Mariposa
    let mintRate1 = "25"; 
    await Mariposa.connect(multisigSigner).addDepartment(mintRate1, 0);

    let count2 = await Mariposa.departmentCount();
    
    // adds another department in Mariposa
    let mintRate2 = "0"; 
    await Mariposa.connect(multisigSigner).addDepartment(mintRate2, 0);

    let count3 = await Mariposa.departmentCount();

    console.log(`\tThe total number of departments that report to Mariposa is now ${count2}`);
    expect(count1).to.be.equals(count2.sub(1)).to.be.equals(count3.sub(2));
}

/**
 * Sets the address of the departments
 * @param Mariposa 
 * @param multisigSigner 
 * @param department_addr 
 */
export async function setDepartmentAddress(
    Mariposa: Contract, 
    multisigSigner: Signer, 
    department_addr1: string, 
    department_addr2: string
) {
    await Mariposa.connect(multisigSigner).setAddressDepartment(1, department_addr1);
    await Mariposa.connect(multisigSigner).setAddressDepartment(2, department_addr2);
    const id1 = await Mariposa.getAddressDepartment(department_addr1); 
    const id2 = await Mariposa.getAddressDepartment(department_addr2);
    expect(id1).to.be.equals(1);
    expect(id2).to.be.equals(2);
}

/**
 * Checks that we cannot set an extra department address
 * @param Mariposa 
 * @param multisigSigner 
 * @param department_addr1 
 */
export async function setExtraDepartment(Mariposa: Contract, multisigSigner: Signer, department_addr1: string) {
    const count = await Mariposa.departmentCount(); 
    console.log(`\tThe number of departments that was added is ${count}`);

    let extraDepartment = count.add(1); 
    let err; 
    try{
        await Mariposa.connect(multisigSigner).setAddressDepartment(extraDepartment, department_addr1);
        err = `New department address set`
    }
    catch (Error){
        err =  `\tThere are only ${count} departments that exist and so we cannot set a department ${extraDepartment}.`
    }
    console.log(err);
    expect(err).to.be.equals(`\tThere are only ${count} departments that exist and so we cannot set a department ${extraDepartment}.`);
}

/**
 * Adjust the department parameters
 * @param Mariposa 
 * @param multisigSigner 
 * @param rate2 
 * @param target2 
 */
export async function setDepartmentAdjustment(
    Mariposa: Contract, 
    multisigSigner: Signer,  
) {
    // sets adjustment for the second department
    let newMintRate = "5";
    await Mariposa.connect(multisigSigner).setDepartmentAdjustment(newMintRate, 2);

    let department2 = await Mariposa.getDepartment(2);
    let expected_mintRate = department2.mintRate;

    expect(newMintRate).to.equals(expected_mintRate); 
}

/**
 * Logs the total mint rate
 * @param Mariposa 
 */
export async function totalEmissions(Mariposa: Contract) {
    let totalMintRate = await Mariposa.currentEmissions();
    console.log(`\tTotal emissions across all departments is ${totalMintRate}`);
    expect(totalMintRate).to.equals(30)
}

/**
 * Updates the different department fields by making a call to "distribute"
 * @param Mariposa 
 */
export async function updateDistributions(Mariposa: Contract) {
    // returns the number of departments and the totalSupply being minted
    let count = await Mariposa.departmentCount(); 
    let totalSupply = parseInt(await Mariposa.currentOutstanding());

    // calls distribute on each department
    for (let i = 1; i <= count; i++){
        await Mariposa.distribute(i);
        let departmentBalance = parseInt(await Mariposa.getDepartmentBalance(i));

        totalSupply += departmentBalance; 
    }

    let currentOutstanding = await Mariposa.currentOutstanding();
    expect(currentOutstanding).to.equals(totalSupply);
    
}

/**
 * Fast forward eight hours into the future
 */
export async function fastForwardEightHours() {
    console.log(`\t⌛ Fast forwarding 8 hours`);
    await hre.network.provider.send("evm_increaseTime", [60 * 60 * 8]);
    await hre.network.provider.send("evm_mine");
    for (let i = 1; i <= 60 * 60; i++) { 
        await hre.network.provider.send("evm_mine");
    }
}

/**
 * Calls distribute before and after eight hours have passed
 * @param Mariposa 
 */
export async function epochDistributions(Mariposa: Contract) {
    let count = await Mariposa.departmentCount(); 
    let err; 

    try {
        for (let i = 1; i <= count; i++){
            await Mariposa.distribute(i); 
        }
        err =  `\tWarning! Distribute is being called less than eight hours after the last distribution.`
    }
    catch (Error) {
        fastForwardEightHours(); 
        for (let i = 1; i <= count; i++){
            await Mariposa.distribute(i); 
        }
        err = `\tDistribution call is only occurring after an eight hour period.`
    }
    console.log(err);
    expect(err).to.equals(`\tDistribution call is only occurring after an eight hour period.`);
}

