import {expect} from "chai";
import { Contract, Signer } from "ethers";
import { MariposaTest } from "./Mariposa";

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
    department1Addr: string,
    department2Addr: string
    ) {
    let count1 = await Mariposa.departmentCount();

    // adds a department in Mariposa
    await Mariposa.connect(multisigSigner).addDepartment(true, "2000", "10000", "100000");
    let count2 = await Mariposa.departmentCount();

    // adds another department in Mariposa
    await Mariposa.connect(multisigSigner).addDepartment(false, 0, 0, 0);
    let count3 = await Mariposa.departmentCount();

    console.log(`\tThe total number of departments that report to Mariposa is now ${count2}`);
    expect(count1).to.be.equals(count2.sub(1)).to.be.equals(count3.sub(2));

    await Mariposa.connect(multisigSigner).setAddressDepartment(1, department1Addr);
    await Mariposa.connect(multisigSigner).setAddressDepartment(2, department2Addr);
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
    await Mariposa.connect(multisigSigner).setDepartmentAdjustment(true, 2, 500, 3500);

    let department2 = await Mariposa.getDepartment(2);
    let expected_adjustmentRate2 = department2.adjustmentRate;

    expect(500).to.equals(expected_adjustmentRate2); 
}

export async function callsDistribute(Mariposa: Contract) {
    await Mariposa.distribute({"gasLimit": Number("30000000")});
}

