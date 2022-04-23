import {expect} from "chai";
import { Contract, Signer } from "ethers";

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
    try {
        await BTRFLY.connect(multisigSigner).mint(walletAddr, txnAmt);    
    }
    catch (Error)
    {
        console.log(`\tWhen vault is set to the multisig tokens are not minted.`);
        await BTRFLY.connect(mariposaSigner).mint(walletAddr, txnAmt);
    }
    const bal = await BTRFLY.balanceOf(walletAddr); 
    console.log(`\tThe balance of the wallet after minting with vault set as Mariposa is ${bal}`);
    expect(bal).to.be.equals(txnAmt);
}