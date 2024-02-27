# EVM Connectivity

So far, State Connector has allowed Flare to connect to a few other chains and gather different data.
In the previous blogposts, we have learned, how state [connector works](https://TODO) and what kind of [different attestations](https://TODO) we can get from it.
Attestations that we know so far are:
- Simple payment
- Non existence of a payment with reference
- Balance decreasing transaction
- Block height confirmation
- Address validity check

and we know, that State connector allows Flare to connect to the following chains:
- BTC
- DOGE
- XRP Ledger

In this blogpost, we will uncover a new type of attestation and a new chain that Flare will be able to connect to, how to attest to such transactions and most importantly, what kind of data we can get from them.
We are moving from the world of UTXO chains to the world of EVM chains wit a new `EVMTransaction` attestation type and two different chains: Ethereum and Flare (or testnets Sepolia and Coston2 for Coston testnet).
This gives us a whole new set of possibilities, firstly the chain is now account based (as was XRP Ledger) and secondly, transactions on EVM chains can be much more complex as we enter the world of smart contracts.

The information State Connector provides is similar as before (sender and recipient, amount, block, timestamp, etc.), but since we are on a smart chain now, we can also get additional things, namely, we are able to extract full data about events that were emitted during the transaction, and we can also get the input data of the transaction (in case a contract was called).

## Transaction Type

Let's jump directly into the transaction type to see what kind of data we need to provide.

The toplevel `Request` in the `EVMTransaction` has the same structure as others
```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

/**
 * @custom:name EVMTransaction
 * @custom:id 0x06
 * @custom:supported ETH, FLR, SGB, testETH, testFLR, testSGB
 * @author Flare
 * @notice A relay of a transaction from an EVM chain.
 * This type is only relevant for EVM-compatible chains.
 * @custom:verification If a transaction with the `transactionId` is in a block on the main branch with at least `requiredConfirmations`, the specified data is relayed.
 * If an indicated event does not exist, the request is rejected.
 * @custom:lut `timestamp`
 */
interface EVMTransaction {
    /**
     * @notice Toplevel request
     * @param attestationType ID of the attestation type.
     * @param sourceId  ID of the data source.
     * @param messageIntegrityCode `MessageIntegrityCode` that is derived from the expected response.
     * @param requestBody Data defining the request. Type (struct) and interpretation is determined by the `attestationType`.
     */
    struct Request {
        bytes32 attestationType;
        bytes32 sourceId;
        bytes32 messageIntegrityCode;
        RequestBody requestBody;
    }

    /**
     * @notice Toplevel response
     * @param attestationType Extracted from the request.
     * @param sourceId Extracted from the request.
     * @param votingRound The ID of the State Connector round in which the request was considered.
     * @param lowestUsedTimestamp The lowest timestamp used to generate the response.
     * @param requestBody Extracted from the request.
     * @param responseBody Data defining the response. The verification rules for the construction of the response body and the type are defined per specific `attestationType`.
     */
    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    /**
     * @notice Toplevel proof
     * @param merkleProof Merkle proof corresponding to the attestation response.
     * @param data Attestation response.
     */
    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }

    /**
     * @notice Request body for EVM transaction attestation type
     * @custom:below Note that events (logs) are indexed in block not in each transaction. The contract that uses the attestation should specify the order of event logs as needed and the requestor should sort `logIndices`
     * with respect to the set specifications. If possible, the contact should only require one `logIndex`.
     * @param transactionHash Hash of the transaction(transactionHash).
     * @param requiredConfirmations The height at which a block is considered confirmed by the requestor.
     * @param provideInput If true, "input" field is included in the response.
     * @param listEvents If true, events indicated by `logIndices` are included in the response. Otherwise, no events are included in the response.
     * @param logIndices If `listEvents` is `false`, this should be an empty list, otherwise, the request is rejected. If `listEvents` is `true`, this is the list of indices (logIndex) of the events to be relayed (sorted by the requestor). The array should contain at most 50 indices. If empty, it indicates all events in order capped by 50.
     */
    struct RequestBody {
        bytes32 transactionHash;
        uint16 requiredConfirmations;
        bool provideInput;
        bool listEvents;
        uint32[] logIndices;
    }

    /**
     * @notice Response body for EVM transaction attestation type
     * @custom:below The fields are in line with [transaction](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_gettransactionbyhash) provided by EVM node.
     * @param blockNumber Number of the block in which the transaction is included.
     * @param timestamp Timestamp of the block in which the transaction is included.
     * @param sourceAddress The address (from) that signed the transaction.
     * @param isDeployment Indicate whether it is a contract creation transaction.
     * @param receivingAddress The address (to) of the receiver of the initial transaction. Zero address if `isDeployment` is `true`.
     * @param value The value transferred by the initial transaction in wei.
     * @param input If `provideInput`, this is the data send along with the initial transaction. Otherwise it is the default value `0x00`.
     * @param status Status of the transaction 1 - success, 0 - failure.
     * @param events If `listEvents` is `true`, an array of the requested events. Sorted by the logIndex in the same order as `logIndices`. Otherwise, an empty array.
     */
    struct ResponseBody {
        uint64 blockNumber;
        uint64 timestamp;
        address sourceAddress;
        bool isDeployment;
        address receivingAddress;
        uint256 value;
        bytes input;
        uint8 status;
        Event[] events;
    }

    /**
     * @notice Event log record
     * @custom:above An `Event` is a struct with the following fields:
     * @custom:below The fields are in line with [EVM event logs](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getfilterchanges).
     * @param logIndex The consecutive number of the event in block.
     * @param emitterAddress The address of the contract that emitted the event.
     * @param topics An array of up to four 32-byte strings of indexed log arguments.
     * @param data Concatenated 32-byte strings of non-indexed log arguments. At least 32 bytes long.
     * @param removed It is `true` if the log was removed due to a chain reorganization and `false` if it is a valid log.
     */
    struct Event {
        uint32 logIndex;
        address emitterAddress;
        bytes32[] topics;
        bytes data;
        bool removed;
    }
}
```

The `attestatationType` is now hex encoding of `hexEncode("EVMTransaction")`

Currently supported `sourceId` are
- TODO: Naštej jih in prveri, da delajo ok


## Request Body

The updated thing is `RequestBody` type defined as follows:

```solidity
    /**
     * @notice Request body for EVM transaction attestation type
     * @custom:below Note that events (logs) are indexed in block not in each transaction. The contract that uses the attestation should specify the order of event logs as needed and the requestor should sort `logIndices`
     * with respect to the set specifications. If possible, the contact should only require one `logIndex`.
     * @param transactionHash Hash of the transaction(transactionHash).
     * @param requiredConfirmations The height at which a block is considered confirmed by the requestor.
     * @param provideInput If true, "input" field is included in the response.
     * @param listEvents If true, events indicated by `logIndices` are included in the response. Otherwise, no events are included in the response.
     * @param logIndices If `listEvents` is `false`, this should be an empty list, otherwise, the request is rejected. If `listEvents` is `true`, this is the list of indices (logIndex) of the events to be relayed (sorted by the requestor). The array should contain at most 50 indices. If empty, it indicates all events in order capped by 50.
     */
    struct RequestBody {
        bytes32 transactionHash;
        uint16 requiredConfirmations;
        bool provideInput;
        bool listEvents;
        uint32[] logIndices;
    }
```

- `TransactionHash`: Hash of the transaction we are observing
- `RequiredConfirmations`: The number of blocks after the transaction we are requesting that must be visible to attestation client to consider this transaction as finalized.
In contrast with the previous payment (or block height) attestation where the amount of block confirmations was set per chain, this type is more liberal and allows us to choose how many confirmations we want and thus adapt our security assumptions (about the other chain).
- `provideInput`: If the response should also contain the input of the transaction.
We can always include the input, but this might produce large data struct that we will need to supply when using this transaction.
If you don't need to use this data it is advisable to not include it, as you incur additional gas cost both for supplying it to the verification contract and making a transaction.
Keep in mind, that it might be useful - for example to check what contract was deployed or what was the toplevel method, that was executed.
- `listEvents`: Events are important and very powerful tool when interacting with EVM chains, but including them adds additional costs (the same as with input), so if you don't need events, you can save some gas costs by excluding them.
- `logIndices`: An array of log indices (in any order, with repetitions allowed) for which events (logs) you want included as the result of your transaction attestation. As before - don't include events you don't need for gas reasons.
Importantly leaving this array empty will include all events emitted in the same order as they were emitted.
The indices are the block log indices, indicating the vent index in the whole block (not just the transactions you are attesting to), but if you supply index outside your transaction range, the corresponding event won't be included. (<!--TODO: link do definicije tega-->)
In any case, the amount of returned events is limited to 50, so if you want to attest, that you have included all the events in a single transaction, make sure it has 49 of them or less (in any case, what kind of transaction did you make to require 50 events?)


## Response Body

Let's see what a treasure trove of information EVM attestation type is

```solidity
    /**
     * @notice Response body for EVM transaction attestation type
     * @custom:below The fields are in line with [transaction](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_gettransactionbyhash) provided by EVM node.
     * @param blockNumber Number of the block in which the transaction is included.
     * @param timestamp Timestamp of the block in which the transaction is included.
     * @param sourceAddress The address (from) that signed the transaction.
     * @param isDeployment Indicate whether it is a contract creation transaction.
     * @param receivingAddress The address (to) of the receiver of the initial transaction. Zero address if `isDeployment` is `true`.
     * @param value The value transferred by the initial transaction in wei.
     * @param input If `provideInput`, this is the data send along with the initial transaction. Otherwise it is the default value `0x00`.
     * @param status Status of the transaction 1 - success, 0 - failure.
     * @param events If `listEvents` is `true`, an array of the requested events. Sorted by the logIndex in the same order as `logIndices`. Otherwise, an empty array.
     */
    struct ResponseBody {
        uint64 blockNumber;
        uint64 timestamp;
        address sourceAddress;
        bool isDeployment;
        address receivingAddress;
        uint256 value;
        bytes input;
        uint8 status;
        Event[] events;
    }

    /**
     * @notice Event log record
     * @custom:above An `Event` is a struct with the following fields:
     * @custom:below The fields are in line with [EVM event logs](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getfilterchanges).
     * @param logIndex The consecutive number of the event in block.
     * @param emitterAddress The address of the contract that emitted the event.
     * @param topics An array of up to four 32-byte strings of indexed log arguments.
     * @param data Concatenated 32-byte strings of non-indexed log arguments. At least 32 bytes long.
     * @param removed It is `true` if the log was removed due to a chain reorganization and `false` if it is a valid log.
     */
    struct Event {
        uint32 logIndex;
        address emitterAddress;
        bytes32[] topics;
        bytes data;
        bool removed;
    }
```

The response body struct contains the following fields
- `blockNumber`: Number of the block in which the transaction is included
- `timestamp`: Timestamp of the block the transaction was included in
- `sourceAddress`: Address signing the transaction.
Since Flare is EVM chain, this is nicely mapped to the address type directly, and we don't have to operate with strings or address hashes.
- `isDeployment`: Flag indicating if this transaction was contract deployment.
- ` receivingAddress`: The `to` address of the transaction (this is zero address if we are dealing with contract deployment).
Keep in mind, that this can also be contract address (if toplevel transaction is contract call) and this is where things get interesting.
- `value`: The value (in wei) transferred by the toplevel transaction.
Values transferred by internal transactions are not tracked by this type - bit if proper events are emitted, you can use them to follow this.
If there is no value, the value has default `0` value.
- `input`: The input provided with thins transaction (useful for contract calls), if no input is provided, a default value of zero bytes is used.
- `status`: The status of the transaction, it can either be `1` indicating success or `0` indicating failure (without failure reason).
- `events`: Array of requested events in the same order as requested. 

Each event has the following fields:
- `logIndex`: The consecutive number of the event in the block.
- `emitterAddress`: The address of the contract that emitted the event.
- `topics`: An array of up to four 32-byte strings of indexed log arguments.
- `data`: Concatenated 32-byte strings of non-indexed log arguments.
This (together with topics) is usually the part of event that you will decode to get the information you need.
Keep in mind, that this is event specific and you will need to know the event structure to decode it properly.
- `removed`: It is `true` if the log was removed due to a chain reorganization (transaction was mined, but the block was not on the main chain) and `false` if it is a valid log.

## Usage examples

Now we know how to request things the attestation and what we are getting in return, let's play around and see some examples.
Examples are now a bit more involved and each of the examples will come in a few parts:
- Script making a dummy transaction on `Sepolia` testnet.
- Smart contract(s) accepting attestation request and performing some desired action
- Deployment and run script, that ties them together.

This deployment script will also allow us to explain exactly how long the waiting for each phase takes (something we have kinda hid until now).


### Simple transaction with value

Let's start small.
We will create a smart contract, that just tallies the toplevel amounts transferred to a designated address on sepolia.

The scenario is pretty simple.
We have a "payment" to externally owned account (EOA - so not smart contract) on sepolia, and anyone can send funds there and prove this.
On the Flare side, we will deploy a contract, that will accept proofs with data in do the proper accounting who has sent how much to this end owner address.

The full code for this example is in the `scripts/evm/trySimpleTransaction.ts`, `contracts/EthereumPaymentCollector.sol` and `contracts/FallbackContract` files.

We won't be copy-pasting the full code here, but we will go through the most important parts.

The setup is now in two parts, and `main` correctly picks up the right part to run depending on the network it is run on

We first run `yarn hardhat run scripts/evm/trySimpleTransaction --network sepolia` to deploy simple `FallbackContract` on Sepolia.
This contract will just emit an event when the `fallback` function is called.
We will be attesting to this event in the next part.
The script makes two transactions on Sepolia, one with value to an address and one to the address of the contract.
The second transaction will call the `fallback` function and emit the event.
The transaction hashes are logged, and JSON response of the attestation results is printed (so we can see what we will get in the next part).

Here is the example results:

```json
0xac640ab047aa1097ddd473e5940921eb500a9912b33072b8532617692428830e
{
  "status": "VALID",
  "response": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "0",
    "lowestUsedTimestamp": "1708907688",
    "requestBody": {
      "transactionHash": "0xac640ab047aa1097ddd473e5940921eb500a9912b33072b8532617692428830e",
      "requiredConfirmations": "1",
      "provideInput": true,
      "listEvents": true,
      "logIndices": []
    },
    "responseBody": {
      "blockNumber": "5363670",
      "timestamp": "1708907688",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "isDeployment": false,
      "receivingAddress": "0xFf02F742106B8a25C26e65C1f0d66BEC3C90d429",
      "value": "10",
      "input": "0x0123456789",
      "status": "1",
      "events": []
    }
  }
}
0x7eb54cde238fc700be31c98af7e4df8c4fc96fd5c634c490183ca612a481efcc
{
  "status": "VALID",
  "response": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "0",
    "lowestUsedTimestamp": "1708907712",
    "requestBody": {
      "transactionHash": "0x7eb54cde238fc700be31c98af7e4df8c4fc96fd5c634c490183ca612a481efcc",
      "requiredConfirmations": "1",
      "provideInput": true,
      "listEvents": true,
      "logIndices": []
    },
    "responseBody": {
      "blockNumber": "5363672",
      "timestamp": "1708907712",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "isDeployment": false,
      "receivingAddress": "0xeBBf567beDe2D8842dF538Cf64E0bE9976183853",
      "value": "10",
      "input": "0x9876543210",
      "status": "1",
      "events": [
        {
          "logIndex": "160",
          "emitterAddress": "0xeBBf567beDe2D8842dF538Cf64E0bE9976183853",
          "topics": [
            "0xaca09dd456ca888dccf8cc966e382e6e3042bb7e4d2d7815015f844edeafce42"
          ],
          "data": "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000059876543210000000000000000000000000000000000000000000000000000000",
          "removed": false
        }
      ]
    }
  }
}
``` 

After we have the transaction hashes, we copy them to the part of `main` method that will execute the state connector part, this time on Coston.
Let's take a look at `executeStateConnectorProof`.

Here, the state connector part comes into the play.
You have already seen it in the previous blogposts, so we will just quickly glance through it.
The code is bit more involved, as we now work with multiple transactions (this is not EVMTransaction specific, but it is a good example of how you can use the state connector to do more complex things).
We again, get encoded attestation request (one for each transaction) and then we submit them to the state connector.
Once this is done, we wait for the round to be confirmed (see the while loop that takes most of the time) and then we get the proof.

The `EthereumPaymentCollector` contract is deployed on Coston with one important method `collectPayment`.
This method accepts the `EVMTransaction.Proof` response and does the important accounting.

As usual, we first check that the provided proof is correct - that the Merkle proof really attests that this transaction was included in Merkle tree.

The comes the fun part, we can use the information from transaction to do whatever we want.
We won't, just write it to the list of all transactions and be done.
But we will try to decode the event data and see what we can get from it.
As said before, the event data is specific to the event and we need to know the event structure to decode it properly.
In this case, we know how it looks like and the decoding is done by builtin `abi.decode`.
We then just push the decoded data in struct form to the list of events and we are done.
A word of caution, the `abi.decode` is not type safe and you can easily get wrong results if you don't know the event structure, even more, this might be a security risk if you are not careful (or revert unexpectedly), but it is a nice representation of how powerful the events - and their information - can be.

Finally, when we have both proofs and the contract deployed, we just call the `collectPayment` method with the proofs and we are done (unless something goes wrong, then we will have to wait for the next round and try again).

The results is something like this:
```json
Rounds:  [ '809307', '809307' ]
Waiting for the round to be confirmed 809303n 809307
Waiting for the round to be confirmed 809303n 809307
Waiting for the round to be confirmed 809303n 809307
Waiting for the round to be confirmed 809304n 809307
Waiting for the round to be confirmed 809304n 809307
Waiting for the round to be confirmed 809304n 809307
Waiting for the round to be confirmed 809304n 809307
Waiting for the round to be confirmed 809304n 809307
Waiting for the round to be confirmed 809305n 809307
Waiting for the round to be confirmed 809305n 809307
Waiting for the round to be confirmed 809305n 809307
Waiting for the round to be confirmed 809305n 809307
Waiting for the round to be confirmed 809306n 809307
Waiting for the round to be confirmed 809306n 809307
Waiting for the round to be confirmed 809306n 809307
Waiting for the round to be confirmed 809306n 809307
Waiting for the round to be confirmed 809306n 809307
Round confirmed, getting proof
Successfully submitted source code for contract
contracts/EthereumPaymentCollector.sol:EthereumPaymentCollector at 0x7cf6E7aeFD0207a5bE9a7DbcDA560fc7a6dBD7B4
for verification on the block explorer. Waiting for verification result...

Successfully verified contract EthereumPaymentCollector on the block explorer.
https://coston-explorer.flare.network/address/0x7cf6E7aeFD0207a5bE9a7DbcDA560fc7a6dBD7B4#code

{
  "data": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "lowestUsedTimestamp": "1708907688",
    "requestBody": {
      "listEvents": true,
      "logIndices": [],
      "provideInput": true,
      "requiredConfirmations": "1",
      "transactionHash": "0xac640ab047aa1097ddd473e5940921eb500a9912b33072b8532617692428830e"
    },
    "responseBody": {
      "blockNumber": "5363670",
      "events": [],
      "input": "0x0123456789",
      "isDeployment": false,
      "receivingAddress": "0xFf02F742106B8a25C26e65C1f0d66BEC3C90d429",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "status": "1",
      "timestamp": "1708907688",
      "value": "10"
    },
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "809307"
  },
  "merkleProof": [
    "0x56faf895bbcb0b2a6f3bc283ea5e1793b224dca8b4b99240a34cee6d9bf1b8f3",
    "0x13ef0de709e7b0485f7623f5a0ad5b56aa23626fbffe5e7f4502bb7be5e0bf7e",
    "0xf72c31824174676516a9c5d9713cb1ae8866cac71462fe2b1a3c1e1b9418a94f"
  ]
}
{
  "data": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "lowestUsedTimestamp": "1708907712",
    "requestBody": {
      "listEvents": true,
      "logIndices": [],
      "provideInput": true,
      "requiredConfirmations": "1",
      "transactionHash": "0x7eb54cde238fc700be31c98af7e4df8c4fc96fd5c634c490183ca612a481efcc"
    },
    "responseBody": {
      "blockNumber": "5363672",
      "events": [
        {
          "data": "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000059876543210000000000000000000000000000000000000000000000000000000",
          "emitterAddress": "0xeBBf567beDe2D8842dF538Cf64E0bE9976183853",
          "logIndex": "160",
          "removed": false,
          "topics": [
            "0xaca09dd456ca888dccf8cc966e382e6e3042bb7e4d2d7815015f844edeafce42"
          ]
        }
      ],
      "input": "0x9876543210",
      "isDeployment": false,
      "receivingAddress": "0xeBBf567beDe2D8842dF538Cf64E0bE9976183853",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "status": "1",
      "timestamp": "1708907712",
      "value": "10"
    },
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "809307"
  },
  "merkleProof": [
    "0x8e45d2d564bf7d652cf904a72e53f5e7e34d7e5e184906afda92f755e99cd421",
    "0x13ef0de709e7b0485f7623f5a0ad5b56aa23626fbffe5e7f4502bb7be5e0bf7e",
    "0xf72c31824174676516a9c5d9713cb1ae8866cac71462fe2b1a3c1e1b9418a94f"
  ]
}
```

An important thing to keep in mind is the following:
On the previous attestation types, we were only able to get transaction in the last two days (this is attestation type specific).

### Event emittance + decoding

As already said, event will be the core feature of observing what is happening on other chains.
Let's now use this to prove that an ERC20 payment was made on Sepolia and then decode the event to see who made the payment and how much.
As before, we will deploy an ERC20 contract on Sepolia, mint some tokens and send them to an address. 
The full code is available in `scripts/evm/tryERC20transfers.ts` and `contracts/MintableERC20.sol` files.

A sample response for the ERC20 transaction would look like this
```json
Sepolia USDT deployed to: 0x6023e19d70C304eA16a3728ceDcb042791737EC3
0xd7eed8cf377a4079718e8d709b3648d62a3a16ea39fbfbe759600c3d574caa15
{
  "status": "VALID",
  "response": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "0",
    "lowestUsedTimestamp": "1708999068",
    "requestBody": {
      "transactionHash": "0xd7eed8cf377a4079718e8d709b3648d62a3a16ea39fbfbe759600c3d574caa15",
      "requiredConfirmations": "1",
      "provideInput": true,
      "listEvents": true,
      "logIndices": []
    },
    "responseBody": {
      "blockNumber": "5370899",
      "timestamp": "1708999068",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "isDeployment": false,
      "receivingAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
      "value": "0",
      "input": "0x40c10f190000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f37300000000000000000000000000000000000000000000000000000000000f4240",
      "status": "1",
      "events": [
        {
          "logIndex": "38",
          "emitterAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
          "topics": [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373"
          ],
          "data": "0x00000000000000000000000000000000000000000000000000000000000f4240",
          "removed": false
        }
      ]
    }
  }
}
0x9dffa80b6daea45ed4bfc93bb72cdb893549fdefb81cb760b7ce08edef9859a6
{
  "status": "VALID",
  "response": {
    "attestationType": "0x45564d5472616e73616374696f6e000000000000000000000000000000000000",
    "sourceId": "0x7465737445544800000000000000000000000000000000000000000000000000",
    "votingRound": "0",
    "lowestUsedTimestamp": "1708999080",
    "requestBody": {
      "transactionHash": "0x9dffa80b6daea45ed4bfc93bb72cdb893549fdefb81cb760b7ce08edef9859a6",
      "requiredConfirmations": "1",
      "provideInput": true,
      "listEvents": true,
      "logIndices": []
    },
    "responseBody": {
      "blockNumber": "5370900",
      "timestamp": "1708999080",
      "sourceAddress": "0x4C3dFaFc3207Eabb7dc8A6ab01Eb142C8655F373",
      "isDeployment": false,
      "receivingAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
      "value": "0",
      "input": "0xa9059cbb000000000000000000000000ff02f742106b8a25c26e65c1f0d66bec3c90d42900000000000000000000000000000000000000000000000000000000000003e8",
      "status": "1",
      "events": [
        {
          "logIndex": "32",
          "emitterAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
          "topics": [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373",
            "0x000000000000000000000000ff02f742106b8a25c26e65c1f0d66bec3c90d429"
          ],
          "data": "0x00000000000000000000000000000000000000000000000000000000000003e8",
          "removed": false
        }
      ]
    }
  }
}
```

Let's now decode the data we got back and explore the event a little more into detail.
```json
{
  "logIndex": "38",
  "emitterAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
  "topics": [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373"
  ],
  "data": "0x00000000000000000000000000000000000000000000000000000000000f4240",
  "removed": false
}
{
  "logIndex": "32",
  "emitterAddress": "0x6023e19d70C304eA16a3728ceDcb042791737EC3",
  "topics": [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373",
    "0x000000000000000000000000ff02f742106b8a25c26e65c1f0d66bec3c90d429"
  ],
  "data": "0x00000000000000000000000000000000000000000000000000000000000003e8",
  "removed": false
}
```
Each transaction has emitted a single event, and we can see that the `emitterAddress` is the address of the USDT contract - the one we want to observe.
When processing the events it is important to know which contract should be emitting the event (you don't want to count a memecoin transfer as an USDT transfer).
The `topics` are the indexed arguments of the event, and the `data` is the non-indexed arguments.
We glossed over this in the first part, but now this will be important.
If we take a look at the event definition
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```
we see, that it has three arguments, two indexed and one non-indexed.
But there are three topics in the event, how do we interpret that.
Well in our case, the first one is the event signature, and the other two are the indexed arguments.
Importantly, that is not always the case (it is the case for events that are emitted by Solidity contracts, but not necessarily for other contracts or direct assembly code).

Let's now decode the event data.
The second event has the following data
```json
"topics": [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x0000000000000000000000004c3dfafc3207eabb7dc8a6ab01eb142c8655f373",
    "0x000000000000000000000000ff02f742106b8a25c26e65c1f0d66bec3c90d429"
  ],
```
The first topic is the [event signature](https://www.4byte.directory/event-signatures/?bytes_signature=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef), and the other two are the from and to addresses.
You can easily see, how they are zero padded to accommodate the whole 32 bytes.

Similarly, the event in the first transaction that just minted 1000000 token wei (hex encoded in the data field) has the same zeroth topic, same recipient (topic with index 2) and zero address as sender. 

#### ERC20 payment

Let's upgrade the contract from before to tally ERC20 payments on external chains.
We do this by listening to events, decode them and use the decoded information

#### Custom event

Here, we will create a simple contract on Sepolia and follow the events it emits - just to see another example on how events function.

### Toplevel transaction + data decoding (allowance of erc20)

We now know haw to listen to events (and decode them), let's see, how we can also decode toplevel transaction data.
Here, we will check if the toplevel transaction really did increase the ERC20 allowance.

### State observation through events

We do not have direct access to state on the other chain, but we can circumvent this using events.
If we deploy a contract on external chain, that emits events pertaining to the state it can read (at that block) from the chain, we can easily observe this state (frozen at that point in time) on Flare.
Let's see, how we can easily observe current status of ERC20 holdings and which accounts are blacklisted from transferring USDT. 

<!-- Meh: ### Contract creation -->

### Bridge contract with execution (more involved example) -- Ta gre lahko v posebi blogpost

So now we know everything there is to know.
Let's put our knowledge to test and create a proof of concept application that acts as a simple bridge controlled by state connector.

The scenario is as follows:
- We want to have a bridging contract from sepolia to Flare.
- We will allow users to deposit funds on sepolia side of the bridge contract together with some calldata they want executed on Flare side.
This deposit will emit event with the instructions.
- Anyone can pick up this event, create state connector attestation request and supply the proof to Flare.
- Once the proof is supplied on Flare (the other side), the receiving bridge contract will check that


Homework: Create an optimistic version that goes in another direction:
- Anyone can submit a request on Flare and event is emitted
- Collateralized 3rd parties can execute the requested transaction on the other side - thus emitting the event about execution.
- Anyone can relay the execution event back to Flare where two things happen:
  - Executing party is seen as executing the correct request and gets rewarded a bit on Flare side (happy path). 
  - Executing party is seen as executing invalid request (wrong value, address...) and is subsequently punished by having the collateral forfeited on Flare side.

Note: This is just an idea of how this works, properly assessing the collateral ratios, making sure that security assumptions hold etc is left to the reader.


Hackaton idea (built on previous idea)

We have source contract on Flare and destination contract on Sepolia and one way secure bridge telling us what is happening on Sepolia.
Flare side is therefore all knowing, while Sepolia lacks information from Flare side
TODO : grda rekurzija pride... turtles all the way down



