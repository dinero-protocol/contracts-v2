import { Signer } from 'ethers';
import { ethers, network } from 'hardhat';

// Impersonates a signer and loads with an initial balance
export async function impersonateSigner(address: string): Promise<Signer> {
  await network.provider.send('hardhat_impersonateAccount', [address]);
  const signer: Signer = ethers.provider.getSigner(address);

  const balance = '0x10000000000000000000000';
  await network.provider.send('hardhat_setBalance', [address, balance]);

  return signer;
}

// Fast forward eight hours
export async function fastForwardEightHours(): Promise<void> {
  await ethers.provider.send('evm_increaseTime', [60 * 60 * 8]);
  await ethers.provider.send('evm_mine', []);
}
