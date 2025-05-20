# LayerAkira Router CLI

## Overview

This repository contains a CLI for interacting with the LayerAkira from router.
It covers order building, submission, query order; query tx hash of executed fills.
Both options for routing
It allows users to set up a test account, create swap orders, query orders, and fetch transaction hashes related to
order execution.

## Setup

### Install Dependencies

```bash
    npm install
```

### Configuration

Update the constants.ts file with relevant details for your environment, such as (fill all TODO):

- CHAIN_ID
- CURRENCIES
- executorContract
- rollupInvoker
- routerAccount
- routerSigner
- rpcProvider
- routerFeeRecipient

#### Dont forget

- to setup router info in [src/constants.ts](src/constants.ts)
- to approveExecutor from client in coreContract
- to approveExecutor from router in router contract
- register your router
- ping us to wl your source

## Usage

```bash
tsx src/index.ts
```

### Commands

- Set Tester Account
  - setTester <account> <private key> <nonce>
  - example `setTester 0x1234abcd... 0x5678efgh... 0`
  - This sets up a trading test account with a given private key and nonce.
- Swap Tokens (SOR Supported)
  - swap <payField> <payAmount> <receiveField> <receiveAmount> <slippageBips> <gasToken> <snip9> <useNativeRouter> <externalFunds>
  - example `swap AETH 0.1 AUSDC 0 10 AETH true true`
  - This initiates a swap from AETH to AUSDC with a slippage of 10 basis points, using AETH for gas, and enabling
    Snip9 and the native router.
  - example `swap AAAVE 1 AETH 0.147 10 AETH true true true`
  - This initiates a sor swap from AAAVE to AETH via AUSDC with a slippage of 10 basis points, using AETH for gas,
    and enabling Snip9 and the native router.
- SOR Path list
  - list_sor_path
  - example `list_sor_path`
  - This logs some of the available paths for sor swaps.
- Query Order by Hash
  - getOrder <orderHash>
  - `getOrder 0xabcdef...`
  - Fetches details of an order with the given hash.
- Query Transaction by Order Hash
  - queryTransactionByOrderHash <orderHash>
  - `queryTransactionByOrderHash 0xabcdef...`
  - Returns the transaction hash for a given order hash if the order has been executed on-chain.
- Close CLI
  - close
