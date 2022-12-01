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

export const claimData = [
  {
    token: '0xa52fd396891e7a74b641a2cb1a6999fcf56b077e',
    chainId: 1,
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
    value: '1.1182790115220393',
    claimable: '875659918032715',
    claimMetadata: {
      token: '0xa52fd396891e7a74b641a2cb1a6999fcf56b077e',
      account: '0xe7ad7d90639a565fe3a6f68a41ad0b095f631f39',
      amount: '907091304534778',
      merkleProof: [
        '0xb4a4a310153d3376b59c55df0e883341a8cd79fd263e3a30b5ea5f513c213bfd',
        '0x3fceb642303b8fe71fd6f08845ee3b9489a08b5cdd1ae4ac743ad066b31894f2',
        '0xccb51ee9095cefc73b82a2a2ea6faf0ecd16c31bd0d7d2f3e8d6b0573d68792f',
        '0xb27ed3efcf9c04852a0cde160f547627f58153ec8557b6a4f00c76ec1a092b74',
        '0xb4a602fc85d88f3283413feb6024b414be946858803242777f82689c58137c93',
        '0x9685a3973eaa5f65f686c2b25e8c121c7fff678aac3df2222d17cfd890659e15',
        '0xdda0e278e9b7980522d5efad0c6cec9f9b191f251ce3217de3c8f34bf4e4c578',
        '0x63d3665e8b74a430e9b5d822d6599d04c2794f707c951cce151e7824ef7b5494',
        '0xa3c626d00b7faf93af0b41adc9bfb6c5b248d4d888d390ec84d5b137b63d5148',
        '0xca9695431a084472766ad7904cfa4557b50ed080deadb292439ce1d4c470cb6e',
        '0xb4c70a66a056eb02362bd4a0a13f5f756d0381e6171edb28f29ee9b8136db9f8',
        '0xc8f6c44bcbc003d442482d80e485167d510f7871089bea9c53e7656d7aa8cca4',
        '0x1c560a383acb08a5990c0380cd7e6bc84fe4dafa9801098e381b9b7d78597db4',
      ],
    },
  },
  {
    token: '0xc55126051b22ebb829d00368f4b12bde432de5da',
    chainId: 1,
    decimals: 18,
    name: 'BTRFLY',
    symbol: 'BTRFLY',
    value: '5.446535318663248',
    claimable: '39828411836659942',
    claimMetadata: {
      token: '0xc55126051b22ebb829d00368f4b12bde432de5da',
      account: '0xe7ad7d90639a565fe3a6f68a41ad0b095f631f39',
      amount: '40790597137743532',
      merkleProof: [
        '0x45159b7b2e585483d1d2fdece5da56474bf4acb6d89812bf8eddf165fb93a8a4',
        '0x34af010cb666b3c92b0b8a0118535836839fedb3d258121908ee86f027c2d58f',
        '0x1524f5963d210f00de04de99205dff82dd7e7d3b66e1d423559c08a5011611a8',
        '0x57ae41546d2ebf93ca60b31c63a3c21e5737ac55acc79ce0be01461a2d8e4fad',
        '0xe61e54f0f6e7c6db31602dec9eee5b0ea32fd2d43172bb13c0c80935754657ef',
        '0x01e6069de8d816bfda09a5b7f99a544ab554a8890b445c2deeee3ff7714c9078',
        '0x62ca77bbac5983a2ea57c5762be5254820e9edd54f737e08ef1359058cf791ea',
        '0x865d4936d24f478a2700709db9d88701dd466b1a934cb8d9ab4d663f7d2f9fb2',
        '0x73c6477b23e02b384397b294a593c40a9094b93568313465a88befe65efaebf9',
        '0x5e5ca67b409e6432f0bf185d8d483e297745762a14cc2bff9590422c6c41a557',
        '0xe6e0a9e0294cb20cc9fe25946f853c16c602a81c339a2330858f3d75b19ce597',
        '0xf6b50b49385821c1086d52e6956eb385561c8b3127bb5a24562548238e120fc6',
        '0xede80968df84b56ec63505c136d28fe65874502b06c853333504a0368ad3dd2d',
      ],
    },
  },
];

export async function getPermitSignature(
  signer: SignerWithAddress,
  token: Contract,
  spender: string,
  value: BigNumber,
  deadline: BigNumber
): Promise<Signature> {
  const [nonce, name, version, chainId] = await Promise.all([
    token.nonces(signer.address),
    token.name(),
    '1',
    signer.getChainId(),
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
