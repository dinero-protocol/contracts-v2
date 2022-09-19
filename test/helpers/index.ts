import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
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

export const claimData = [
  {
    token: '0xa52fd396891e7a74b641a2cb1a6999fcf56b077e',
    chainId: 1,
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
    value: '0.2588834292740514',
    claimable: '158351079458337',
    claimMetadata: {
      token: '0xa52fd396891e7a74b641a2cb1a6999fcf56b077e',
      account: '0xe7ad7d90639a565fe3a6f68a41ad0b095f631f39',
      amount: '189782465960400',
      merkleProof: [
        '0x06556dc28238c9d65fcb36a4c582a3ac15ee56f8d1013772312a555832f08b4f',
        '0xcd3cff2a9d8f30c640e0c4db8f2ad2ecb00d77a84d83f7f7adcfd7bad98bea19',
        '0x50f5449051a27d82b59741c0a80aa34544646468524ecb20b4b8a3d5ffa45e63',
        '0x7f00ab4b3554c6acdd9b865640194b060468f109f887857554401f9fd7a3fdf7',
        '0x8333b29be33f801d245bc43fadb43e3ea13bed0824cc769b51005f756f6f0cd2',
        '0xfedd1312c708e920ee04846378eac97c8e7296873e4c46399f1f8ac2731447f8',
        '0x509ffd3a0cca8810d7211b85a84548c19726b4dd2d54ac2ca17e3b05349a5637',
        '0xad2d72526a42b4359bc9db84afcf9ea57f15547012c2f22e26438a0257f002bd',
        '0x10cf676e381df3a0fbea425a81c07882a313da57584567cbf495d545fcabd548',
        '0x859df63b057d92da58de3fcf969acef17b0a2404fdd60663767064d6e5290e05',
        '0xed9a2952291f568e94b94f2990e18475325326424d90c52a7fa3c982bac9d02b',
        '0x718d9000c5b3e586dfdfa00f1998ea2421ab8221edd3cf7af4f6c53871cc2d8a',
      ],
    },
  },
  {
    token: '0xc55126051b22ebb829d00368f4b12bde432de5da',
    chainId: 1,
    decimals: 18,
    name: 'BTRFLY',
    symbol: 'BTRFLY',
    value: '1.71032908917368',
    claimable: '6871551181895058',
    claimMetadata: {
      token: '0xc55126051b22ebb829d00368f4b12bde432de5da',
      account: '0xe7ad7d90639a565fe3a6f68a41ad0b095f631f39',
      amount: '7833736482978648',
      merkleProof: [
        '0x8aa457755f843e4aed19e4f0ac982590a5ac2b969b1d9ad9647cfb78d871bf59',
        '0x012d6790c9995f048e8368a56fec2a31fd28e93a241f1d3ae2c230fcb982461d',
        '0x8bf7ac408d8e6ccfd273d9801468e387e28fc8a58b66eaf0ef48730e2095625a',
        '0xc34b134eace517a6ece5c793763db16a921c44dbdf65b50a767a9a0b73a7a00d',
        '0xbe8423eac27199214ad30097c70a19f1ce52b8efc8e572a6ac0f4ca1e80dc412',
        '0x1f165da932579645e3b75f57d69cdb095b1af29b3ede8f59a8d997a1f7f170b8',
        '0xfa44ee80a77fe677f5338079fbe6245a26e5da49d0016271ed5444d7811a73ba',
        '0xb59632518e7af444a669e94fe90ba18322efec59aba498b7788f0b70286322bf',
        '0x9dab0be215b11b8e2c0e8d19ba0c49cff6f1a4b863c10a3a7f823a08a961461b',
        '0x158ee62a7df9c43f1f2a2d9a7fb656301665d3dff3cf63440939e4237bafa668',
        '0xdd1484643d9855e014d7a57981470bb8560bd70bc148125013c97157378a4c09',
        '0x6578ce4ab5b4c4b1d10795dca2d974f9ba9f9a8ef2593b7303fde4c374628750',
      ],
    },
  },
];
