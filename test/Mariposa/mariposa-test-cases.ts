import { expect } from 'chai';
import { Contract, Signer } from 'ethers';
const hre = require('hardhat');

/**
 * Checks that the vault for BTRFLY is Mariposa
 * @param BTRFLY
 * @param multisigSigner
 * @param Mariposa_addr
 */
export async function vaultIsMariposa(
  BTRFLY: Contract,
  multisigSigner: Signer,
  Mariposa_addr: string
) {
  const vault_addr = await BTRFLY.connect(multisigSigner).vault();
  console.log(
    `\t🔐 The vault which has the ability to mint btrfly tokens is ${vault_addr}.`
  );
  expect(vault_addr).to.be.equals(Mariposa_addr);
}

/**
 * Tries minting BTRFLY token with multisig set as the signer
 * @param BTRFLY
 * @param wallet_addr
 * @param multisigSigner
 * @param txnAmt
 */
export async function notMintBTRFLY(
  BTRFLY: Contract,
  wallet_addr: string,
  multisigSigner: Signer,
  txnAmt: string
) {
  const balBefore = await BTRFLY.balanceOf(wallet_addr);
  console.log(
    `\tThe balance of the wallet before minting tokens is ${balBefore}`
  );

  // checks to see if multisig can mint btrfly tokens
  try {
    await BTRFLY.connect(multisigSigner).mint(wallet_addr, txnAmt);
    console.log(`\t✅ Multisig mints btrfly tokens.`);
  } catch (err) {
    throw new Error(`🚫 Multisig does not have the permission to mint btrfly!`);
  }
}

/**
 * Ensures that only Mariposa has the ability to mint btrfly tokens
 * @param BTRFLY
 * @param multisigSigner
 * @param mariposaSigner
 * @param wallet_addr
 * @param txnAmt
 */
export async function mintBTRFLY(
  BTRFLY: Contract,
  mariposaSigner: Signer,
  wallet_addr: string,
  txnAmt: string
) {
  const balBefore = await BTRFLY.balanceOf(wallet_addr);
  console.log(
    `\tThe balance of the wallet before minting the tokens is ${balBefore}`
  );

  // checks to see if mariposa can mint btrfly tokens
  try {
    await BTRFLY.connect(mariposaSigner).mint(wallet_addr, txnAmt);
    console.log(`\t✅ Mariposa mints btrfly tokens.`);
  } catch (err) {
    throw new Error(
      `🚫 When mariposa tries to mint btrfly an error is thrown and tokens are not minted.`
    );
  }

  const balAfter = await BTRFLY.balanceOf(wallet_addr);
  console.log(
    `\t💰 The balance of the wallet after minting with vault set as Mariposa is ${balAfter}.`
  );

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
  multisigSigner: Signer
) {
  const count1 = await Mariposa.departmentCount();

  // adds a department in Mariposa
  const mintRate1 = '2500000000';
  await Mariposa.connect(multisigSigner).addDepartment(mintRate1);

  const count2 = await Mariposa.departmentCount();

  // adds another department in Mariposa
  const mintRate2 = '0';
  await Mariposa.connect(multisigSigner).addDepartment(mintRate2);

  const count3 = await Mariposa.departmentCount();

  console.log(
    `\t🏛  The total number of departments that report to Mariposa is now ${count3}.`
  );

  expect(count1)
    .to.be.equals(count2 - 1)
    .to.be.equals(count3 - 2);
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
  await Mariposa.connect(multisigSigner).setAddressDepartment(
    1,
    department_addr1
  );
  await Mariposa.connect(multisigSigner).setAddressDepartment(
    2,
    department_addr2
  );
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
export async function setExtraDepartment(
  Mariposa: Contract,
  multisigSigner: Signer,
  department_addr1: string
) {
  const count = await Mariposa.departmentCount();
  console.log(`\tThe number of departments that was added is ${count}`);

  const extraDepartment = count + 1;
  try {
    await Mariposa.connect(multisigSigner).setAddressDepartment(
      extraDepartment,
      department_addr1
    );
  } catch (err) {
    throw new Error(
      `🚫 Setting an address for a department that does not exist! There are only ${count} departments that exist and so we cannot set a department ${extraDepartment}.`
    );
  }
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
  multisigSigner: Signer
) {
  // sets adjustment for the second department
  const newMintRate = '5000000000';
  await Mariposa.connect(multisigSigner).setDepartmentAdjustment(
    newMintRate,
    2
  );

  const department2 = await Mariposa.getDepartment(2);
  const expected_mintRate = department2.mintRate;

  expect(newMintRate).to.equals(expected_mintRate);
}

/**
 * Logs the total mint rate
 * @param Mariposa
 */
export async function totalEmissions(Mariposa: Contract) {
  const totalMintRate = await Mariposa.currentEmissions();
  // console.log(`\tTotal emissions across all departments is ${totalMintRate}`);

  const count = await Mariposa.departmentCount();
  let mintCount = 0;
  for (let i = 1; i <= count; i++) {
    let department = await Mariposa.getDepartment(i);
    mintCount += parseInt(department.mintRate);
  }

  expect(totalMintRate).to.equals(mintCount);
}

/**
 * Updates the different department fields by making a call to "distribute"
 * @param Mariposa
 */
export async function updateDistributions(Mariposa: Contract) {
  // returns the number of departments and the totalSupply being minted
  const count = await Mariposa.departmentCount();
  let totalSupply = parseInt(await Mariposa.currentOutstanding());

  // calls distribute on each department
  fastForwardEightHours();
  for (let i = 1; i <= count; i++) {
    await Mariposa.distribute(i);
    let departmentBalance = parseInt(await Mariposa.getDepartmentBalance(i));

    totalSupply += departmentBalance;
  }

  const currentOutstanding = await Mariposa.currentOutstanding();
  expect(currentOutstanding).to.equals(totalSupply);
}

/**
 * Fast forward eight hours into the future
 */
export async function fastForwardEightHours() {
  console.log(`\t⌛ Fast forwarding 8 hours`);
  await hre.network.provider.send('evm_increaseTime', [60 * 60 * 8]);
  await hre.network.provider.send('evm_mine');
  for (let i = 1; i <= 60 * 60; i++) {
    await hre.network.provider.send('evm_mine');
  }
}

/**
 * Calls distribute in the same epoch
 * @param Mariposa
 */
export async function sameEpoch(Mariposa: Contract) {
  const count = await Mariposa.departmentCount();

  // tries calling distribute in the same epoch more than once
  try {
    for (let i = 1; i <= count; i++) {
      await Mariposa.distribute(i);
    }
    console.log`\t✅ Another distribution call in the same epoch was successful!`;
  } catch (err) {
    throw new Error(
      `🚫 Warning! Distribution call cannot be made in the same epoch.`
    );
  }
}

/**
 * Calls distribute after eight hours have passed
 * @param Mariposa
 */
export async function epochDistributions(Mariposa: Contract) {
  const count = await Mariposa.departmentCount();

  // calls distribute in the next epoch
  try {
    fastForwardEightHours();
    for (let i = 1; i <= count; i++) {
      await Mariposa.distribute(i);
    }
    console.log(
      `\t✅ Distribution call is only occurring after an eight hour period.`
    );
  } catch (err) {
    throw new Error(
      `\t🚫 Warning! Cannot call distribute after current epoch is up.`
    );
  }
}

/**
 * Update department budgets correctly through request calls
 * @param Mariposa
 * @param BTRFLY
 * @param department_addr1
 * @param department_addr2
 * @param departmentSigner1
 * @param departmentSigner2
 */
export async function departmentRequests(
  Mariposa: Contract,
  BTRFLY: Contract,
  department_addr1: string,
  department_addr2: string,
  departmentSigner1: Signer,
  departmentSigner2: Signer
) {
  // balance of BTRFLY tokens present in department 1 before call to request
  const btrfly_department1_before = await BTRFLY.balanceOf(department_addr1);
  const departmentBalance1 = await Mariposa.getDepartmentBalance(1);
  const requestedAmount = departmentBalance1;
  await Mariposa.connect(departmentSigner1).request(requestedAmount); // requests entire department balance

  // balance of BTRFLY tokens present in department 1 after call to request
  const btrfly_department1_after = await BTRFLY.balanceOf(department_addr1);
  const departmentBalance1_after = await Mariposa.getDepartmentBalance(1);

  expect(btrfly_department1_after).to.be.equals(
    btrfly_department1_before + requestedAmount
  );
  expect(departmentBalance1_after).to.be.equals(
    departmentBalance1 - requestedAmount
  );

  // balance of BTRFLY tokens present in department 2 before call to request
  const btrfly_department2_before = await BTRFLY.balanceOf(department_addr2);
  const departmentBalance2 = await Mariposa.getDepartmentBalance(2);
  const requestedAmount2 = departmentBalance2;
  await Mariposa.connect(departmentSigner2).request(requestedAmount2);

  // balance of BTRFLY tokens present in department 2 after call to request
  const btrfly_department2_after = await BTRFLY.balanceOf(department_addr2);
  const departmentBalance2_after = await Mariposa.getDepartmentBalance(2);

  expect(btrfly_department2_after).to.be.equals(
    btrfly_department2_before + requestedAmount2
  );
  expect(departmentBalance2_after).to.be.equals(
    departmentBalance2 - requestedAmount2
  );
}

/**
 * Update the mint rates and department balances
 * @param Mariposa
 * @param multisigSigner
 * @param cap
 */
export async function updateMint(
  Mariposa: Contract,
  multisigSigner: Signer,
) {
  let currentBal;

  // resets mint rates to 0 for all departments
  const count = await Mariposa.departmentCount();
  for (let i = 1; i <= count; i++) {
    await Mariposa.connect(multisigSigner).setDepartmentAdjustment(0, i);
  }

  currentBal = await Mariposa.currentOutstanding();
  console.log(
    `\tOutstanding balance across all departments after resetting mint rate to zero is ${currentBal}`
  );

  for (let i = 1; i <= count; i++) {
    fastForwardEightHours();
    await Mariposa.connect(multisigSigner).setMintRate(
      i,
      '2500000000000000000000000'
    );
  }

  const totalEmissions = await Mariposa.currentEmissions();
  console.log(
    `\tThe current total emissions for the next epoch is ${totalEmissions}`
  );

  //tries updating department balance
  try {
    for (let i = 1; i <= count; i++) {
      fastForwardEightHours();
      await Mariposa.distribute();
    }
    console.log(`\t✅ Each department balance updated. `);
  } catch (err) {
    throw new Error(
      `🚫 Current emissions balance is ${totalEmissions} which is greater than or equal to the cap.`
    );
  }
}
