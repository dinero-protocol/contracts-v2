import {expect} from "chai";
import { Contract, Signer } from "ethers";

export async function vaultIsMariposa(BTRFLY: Contract, signer: Signer, Mariposa_addr: string) :Promise<string>{
    const vault_addr = await BTRFLY.connect(signer).vault(); 

    console.log(`the vault address for the btrfly contract is ${vault_addr}`);
    expect(vault_addr).to.be.equals(Mariposa_addr);
    return vault_addr;  
}