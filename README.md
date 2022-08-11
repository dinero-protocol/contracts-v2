# Redacted Protocol

<img width="100%" alt="image" src="https://user-images.githubusercontent.com/1539088/178902027-3ff9d4c1-88a9-4c15-918c-0ba611315ecd.png">

BTRFLY v2 represents a new era for the Redacted ecosystem. It is a transition away from the bond-centric, dilutive token model to a model focused on producing real yield for rlBTRFLY holders.

# Resources

| Contract Name | Deployed Address                                       |
| ------------- | ------------------------------------------------------ |
| Landing Page  | [redacted.finance](https://redacted.finance)           |
| App           | [app.redacted.finance](https://app.redacted.finance)   |
| Docs          | [docs.redacted.finace](https://docs.redacted.finance/) |

# Mainnet Contracts

| Contract Name       | Deployed Address                           |
| ------------------- | ------------------------------------------ |
| BTRFLY V2           | 0xc55126051B22eBb829D00368f4B12Bde432de5Da |
| rlBTRFLY            | 0x742B70151cd3Bc7ab598aAFF1d54B90c3ebC6027 |
| DAO Multisig        | 0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e |
| Mariposa            | 0xCA0f30b51963C4532d95016098d74f0dF9e4518B |
| Token Migrator      | 0xE8B3c26AA82B21A10237F1d3EEbEE40b54c925e4 |
| Rewards Distributor | 0xd7807E5752B368A6a64b76828Aaff0750522a76E |

# Getting Started

Set up .env file using .env.example as template

```shell
npm install
npx hardhat compile
npx hardhat test
```

# Testing

Set up `scripts/loadEnv.sh using` `scripts/loadEnv.example.sh` as example. The Project uses both hardhat tests and forge tests.

```shell
npx hardhat compile
npx hardhat test
npm run forge-test
```

# Deploying Contracts

```shell
npx hardhat compile
npx hardhat run scripts/mainnet-deploy.ts
npx hardhat run scripts/test-contract-state.ts
```
