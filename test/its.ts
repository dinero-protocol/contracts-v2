import {expect} from "chai";
import { Contract, Signer } from "ethers";

export async function vaultIsMariposa(BTRFLY: Contract, signer: Signer, Mariposa_addr: string){
    const vault_addr = await BTRFLY.connect(signer).vault(); 
    expect(vault_addr).to.be.equals(Mariposa_addr); 
}