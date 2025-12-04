# Passkey OneShot

> build a greeter contract that lets me create and sign with a passkey and verify the signature onchain to set a greeting

[live demo at https://passkeydemo.atg.eth.link/](https://passkeydemo.atg.eth.link/)

## built with 🏗 Scaffold-ETH 2

<img width="511" height="362" alt="image" src="https://github.com/user-attachments/assets/d7e9548e-b700-45e2-8746-53b6ec9bd102" />

---

<img width="436" height="409" alt="image" src="https://github.com/user-attachments/assets/9035f19e-ae68-49b4-abaa-00bce12aa3b0" />

---

<img width="538" height="389" alt="image" src="https://github.com/user-attachments/assets/3d22fd56-60cf-4822-81ed-0e479204f600" />

---

<img width="423" height="145" alt="image" src="https://github.com/user-attachments/assets/73f19c8a-41cc-4f84-996a-372a7bbdc0de" />


## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install dependencies if it was skipped in CLI:

```
cd my-dapp-example
yarn install
```

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network using Foundry. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/foundry/foundry.toml`.

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. The contract is located in `packages/foundry/contracts` and can be modified to suit your needs. The `yarn deploy` command uses the deploy script located in `packages/foundry/script` to deploy the contract to the network. You can also customize the deploy script.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

Run smart contract test with `yarn foundry:test`

- Edit your smart contracts in `packages/foundry/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/foundry/script`

## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
