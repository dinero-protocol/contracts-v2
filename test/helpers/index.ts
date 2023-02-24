import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract, Signature } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';

export const callAndReturnEvent = async (
  fn: any,
  fnArgs: any[]
): Promise<any> => {
  const { events } = await (await fn(...fnArgs)).wait();

  return events[events.length - 1];
};

export async function callAndReturnEvents(fn: any, fnArgs: any): Promise<any> {
  const { events } = await (await fn(...fnArgs)).wait();

  return events;
}

export function parseLog(contract: any, event: any): any {
  return contract.interface.parseLog(event);
}

export function validateEvent(event: any, signature: string, args: any): void {
  // Assert the event signature
  expect(event.signature || event.eventSignature).to.equal(signature);
  // Assert all the event arguments (supports primitive data types and arrays only)
  // For arrays, we perform deep equality check instead
  Object.keys(args).forEach((k) => {
    if (Array.isArray(event.args[k])) {
      expect(event.args[k]).to.deep.equal(
        args[k],
        `at ${k} in ${event.eventSignature}`
      );
    } else {
      expect(event.args[k]).to.equal(
        args[k],
        `at ${k} in ${event.eventSignature}`
      );
    }
  });
}

export async function increaseBlockTimestamp(time: number): Promise<void> {
  // Fast forward 1 rewards duration so that balance is reflected
  await ethers.provider.send('evm_increaseTime', [time]);
  await ethers.provider.send('evm_mine', []);
}

// This method prevents the overflow error when calling toNumber() directly on large #s
export function convertBigNumberToNumber(bigNumber: BigNumber): number {
  return Number(bigNumber.toString());
}

export function toBN(num: number): BigNumber {
  return ethers.BigNumber.from(`${num}`);
}

export const impersonateAddressAndReturnSigner = async (
  networkAdmin: SignerWithAddress,
  address: string
): Promise<SignerWithAddress> => {
  await ethers.provider.send('hardhat_impersonateAccount', [address]);
  const account = await ethers.getSigner(address);
  await networkAdmin.sendTransaction({
    to: address,
    value: ethers.utils.parseEther('100'),
  });

  return account;
};

// Min must be 1 or greater
export const getNumberBetweenRange: (min: number, max: number) => number = (
  min: number,
  max: number
) => Math.floor(Math.random() * max) + (min > 0 ? min : 1);

export const randomNumberBetweenRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const MULTISIG_ADDRESS = '0xa52fd396891e7a74b641a2cb1a6999fcf56b077e';

export async function getPermitSignature(
  signer: SignerWithAddress,
  token: Contract,
  spender: string,
  value: BigNumber,
  deadline: BigNumber,
  permitConfig?: { nonce?: BigNumber; name?: string; chainId?: number; version?: string },
): Promise<Signature> {
  const [nonce, name, version, chainId] = await Promise.all([
    permitConfig?.nonce ?? token.nonces(signer.address),
    permitConfig?.name ?? token.name(),
    permitConfig?.version ?? "1",
    permitConfig?.chainId ?? signer.getChainId(),
  ]);

  return ethers.utils.splitSignature(
    await signer._signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: token.address,
      },
      {
        Permit: [
          {
            name: 'owner',
            type: 'address',
          },
          {
            name: 'spender',
            type: 'address',
          },
          {
            name: 'value',
            type: 'uint256',
          },
          {
            name: 'nonce',
            type: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint256',
          },
        ],
      },
      {
        owner: signer.address,
        spender,
        value,
        nonce,
        deadline,
      }
    )
  );
}
