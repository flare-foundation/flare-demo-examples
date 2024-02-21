# Additional State Connector types

In the previous [blog post](TODO:LINK), we have covered the basics of the State Connector protocol and how to use it to prove a payment on an external chain.
If you haven't done so already, I recommend reading it first, as we will be building upon the knowledge from it.

This time, we will explore the other attestation types that are available in the State Connector protocol and see what else can be achieved with it.

We will take a look at the following attestation types (all currently active types are listed in [the spec](https://github.com/flare-foundation/songbird-state-connector-protocol/tree/main/specs/attestations/active-types)):

- [AddressValidity](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/AddressValidity.md): Prove that the string constitutes a valid address on the specified chain. This is useful if you want to make sure that the address is valid before using it in your protocol.
- [BalanceDecreasingTransaction](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/BalanceDecreasingTransaction.md): Prove that the transaction decreased the balance of the address or that the address was the initiator of the transaction.
- [ConfirmedBLockHeightExists](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/ConfirmedBlockHeightExists.md): Prove that block with a specified height is confirmed by a specified number of confirmations and also provide some additional details about the chain block production rate.
- [ReferencePaymentNonexistence](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/ReferencedPaymentNonexistence.md): Prove that the payment with the specified reference does not exist on the specified chain.
This is useful if you need to prove that someone didn't pay you - did not honor the payment you have requested.

The specification also includes EVMTransaction, but this one is more complicated and powerful, and we will cover it in a separate [blog post](TODO:soon).

Each of the types is designed to prove a specific thing about - sometimes about transactions, sometimes about blocks, sometimes just to offload an expensive computation off the chain and have the result available on chain.
The team has carefully studied the most important use cases and designed the attestation types to be safe, well-defined (to make sure, they are confirmed and understood in a non-ambiguous way), and efficient.

Each of the types has an associated off-chain verifier, that is able to deconstruct the encoded request, execute the verification procedure and return the proper response.
To find out more, how verifiers work, you can read the [verifier spec](TODO:LINK).
As with the payment type, each attestation type comes with a verification contract, that is able to verify, that the response and the Merkle proof are correct and that the response was indeed included in the Merkle tree for the round.
The contracts are available in the [specification repository](https://github.com/flare-foundation/songbird-state-connector-protocol/tree/main/contracts/generated/verification), but as in the previous blog, we will be using the ones already deployed and made available by the periphery library.
Don't forget, verifying the proof is just the first part - this tells you, that a request was indeed included in the Merkle tree, but you still need to verify, that the response matches your dapp's requirements (payment is large enough, the address is correct, the transaction was successful, time range is sufficient).

As usual, the whole block with full code is available in the [GitHub repository](TODO:LINK), and you are encouraged to follow if and try it out on your own.

## Attestation types

The first step is to prepare the request for the attestation.
They are prepared in very similar manner, so we first prepare a simple function that will be able to prepare the request for any attestation type.

```typescript
interface AttestationResponse {
    abiEncodedRequest: string;
    status: string;
}

async function prepareAttestationRequest(attestationType: string, network: string, requestData: any): Promise<AttestationResponse> {
    const response = await fetch(
        `${ATTESTATION_URL}/verifier/${network}/${attestationType}/prepareRequest`,
        {
            method: "POST",
            headers: { "X-API-KEY": ATTESTATION_API_KEY as string, "Content-Type": "application/json" },
            body: JSON.stringify(requestData)
        }
    );
    const data = await response.json();
    return data;
}
```

Here, we assume, that our verifier supports all attestation types and networks - that is not required from all the verifiers, but it is a good practice to have a single endpoint for all the requests and route them to the correct verifier based on the request.

Remember, we will be working on `coston` testnet, so we will be using `testBTC` as the `sourceID` (in the body of attestation type).
But as the verifiers are set up for a single deployment, testnet verifiers automatically look at testnets and mainnet verifiers at mainnets, so we specify `BTC` as the network in the request URL.
If we wanted to change the network type we look at, we would have to change the attestation url to point to mainnet verifiers.

Similarly, verifier contracts (the ones, that check the response together with Merkle proof is included in the state connector round) are very similar, the only difference is the type the verification function receives (and thus the type they verify), but then the type is encoded, hashed and the rest of the check is the same.

TODO: Any generic stuff and code

Now, let's take a look at each of the attestation types and see how to prepare the request for them, what we need to provide and what we get in return.

### Balance Decreasing Transaction

Full specification is available [here](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/BalanceDecreasingTransaction.md).

This attestation type is designed to prove that the transaction either decreases the balance for some address or is signed by the source address.
Where would one need this?
One of the purposes of the State Connector is to provide connectivity between different blockchains and allow for the use of the information from one chain on another chain.
Other chains do not necessarily have smart contract capability or support any kind "fund locking" and unlocking based on some conditions.
This is where the State Connector comes to play, as it allow the Flare network to monitor (and police) address on another chain and act upon the changes in the balance of the address.
This way, we can have an address on Bitcoin network that acts as a vault (think fAssets) and in case the address owner violates the agreement and send the funds out, State Connector can detect it.
To make this even more secure and not tied to single chain, the attestation type makes very little assumptions about the violating transaction.
It is enough for the transaction and address to be considered "offending" if the balance of the designated address is lower after the transaction has executed or the address is among the signers of the transaction (even if its balance is greater than before the transaction).

This way, we can track the balance decrease of address even if the balance change comes from a complicated transaction (multisig, complex scripts, specific XRPL transactions where a non participating address can have funds removed...).

The type definition is as follows:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

/**
 * @custom:name BalanceDecreasingTransaction
 * @custom:id 0x02
 * @custom:supported BTC, DOGE, XRP, testBTC, testDOGE, testXRP
 * @author Flare
 * @notice A detection of a transaction that either decreases the balance for some address or is signed by the source address.
 * Such an attestation could prove a violation of an agreement and therefore provides grounds to liquidate some funds locked by a smart contract on Flare.
 *
 * A transaction is considered “balance decreasing” for the address, if the balance after the transaction is lower than before or the address is among the signers of the transaction (even if its balance is greater than before the transaction).
 * @custom:verification The transaction with `transactionId` is fetched from the API of the source blockchain node or relevant indexer.
 * If the transaction cannot be fetched or the transaction is in a block that does not have a sufficient [number of confirmations](/specs/attestations/configs.md#finalityconfirmation), the attestation request is rejected.
 *
 * Once the transaction is received, the response fields are extracted if the transaction is balance decreasing for the indicated address.
 * Some of the request and response fields are chain specific as described below.
 * The fields can be computed with the help of a [balance decreasing summary](/specs/attestations/external-chains/transactions.md#balance-decreasing-summary).
 *
 * ### UTXO (Bitcoin and Dogecoin)
 *
 * - `sourceAddressIndicator` is the the index of the transaction input in hex padded to a 0x prefixed 32-byte string.
 * If the indicated input does not exist or the indicated input does not have the address, the attestation request is rejected.
 * The `sourceAddress` is the address of the indicated transaction input.
 * - `spentAmount` is the sum of values of all inputs with sourceAddress minus the sum of all outputs with `sourceAddress`.
 * Can be negative.
 * - `blockTimestamp` is the mediantime of a block.
 *
 * ### XRPL
 *
 * - `sourceAddressIndicator` is the [standard address hash](/specs/attestations/external-chains/standardAddress.md#standard-address-hash) of the address whose balance has been decreased.
 * If the address indicated by `sourceAddressIndicator` is not among the signers of the transaction and the balance of the address was not lowered in the transaction, the attestation request is rejected.
 *
 * - `spentAmount` is the difference between the balance of the indicated address after and before the transaction.
 * Can be negative.
 * - `blockTimestamp` is the close_time of a ledger converted to unix time.
 *
 * @custom:lut `blockTimestamp`
 */
interface BalanceDecreasingTransaction {
    /**
     * @notice Toplevel request
     * @param attestationType ID of the attestation type.
     * @param sourceId ID of the data source.
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
     * @param votingRound The ID of the State Connector round in which the request was considered. This is a security measure to prevent a collision of attestation hashes.
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
     * @notice Request body for BalanceDecreasingTransaction attestation type
     * @param transactionId ID of the payment transaction.
     * @param sourceAddressIndicator The indicator of the address whose balance has been decreased.
     */
    struct RequestBody {
        bytes32 transactionId;
        bytes32 sourceAddressIndicator;
    }

    /**
     * @notice Response body for BalanceDecreasingTransaction attestation type.
     * @param blockNumber The number of the block in which the transaction is included.
     * @param blockTimestamp The timestamp of the block in which the transaction is included.
     * @param sourceAddressHash Standard address hash of the address indicated by the `sourceAddressIndicator`.
     * @param spentAmount Amount spent by the source address in minimal units.
     * @param standardPaymentReference Standard payment reference of the transaction.
     */
    struct ResponseBody {
        uint64 blockNumber;
        uint64 blockTimestamp;
        bytes32 sourceAddressHash;
        int256 spentAmount;
        bytes32 standardPaymentReference;
    }
}
```

The request body consist of only two arguments:
- `transactionId` - the ID of the payment transaction we want to prove (same as with payment)
- `sourceAddressIndicator` - the indicator of the address whose balance has been decreased.
On Bitcoin and Dogecoin, this is the index of the transaction input in hex padded to a 0x prefixed 32-byte string (Very similar as inUtxo in payment type). On XRPL, this is the standard address hash of the address whose balance we want to prove has decreased.

Once the request is submitted, the verifiers will check the transaction, do full accounting of the requested source address and confirm the response if and only if the transaction is indeed decreasing the balance of the address or the address is among the signers of the transaction.
In short, the request won't be confirmed if the balance stays the same and the address is not among the signers of the transaction, so there is no way to have a false positive.

If the address has indeed decreased the balance(or participated as signer), the response will also contain information about when exactly the offending transaction has happened - the balance decrease might be allowed (after certain time, or with correct payment reference).
- `blockNumber` - the number of the block in which the transaction is included.
- `blockTimestamp` - the timestamp of the block in which the transaction is included (for utxo chains, this is `mediantime`, for XRPL, this is `close_time` of the ledger).
- `sourceAddressHash` - standard address hash of the address indicated by the `sourceAddressIndicator`. If on utxo chain, this gives us the address that controlled the designated input.
- `spentAmount` - amount spent by the source address in minimal units. If this is negative, the address has received funds in the transaction (but might still be among the signers).
- `standardPaymentReference` - standard payment reference of the transaction. This is useful if the transaction is an allowed payment, and the payment reference is used to identify it.

Let's see how the verification contract looks

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../interface/types/BalanceDecreasingTransaction.sol";
import "../../interface/external/IMerkleRootStorage.sol";
import "./interface/IBalanceDecreasingTransactionVerification.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BalanceDecreasingTransactionVerification is IBalanceDecreasingTransactionVerification {
   using MerkleProof for bytes32[];

   IMerkleRootStorage public immutable merkleRootStorage;

   constructor(IMerkleRootStorage _merkleRootStorage) {
      merkleRootStorage = _merkleRootStorage;
   }

   function verifyBalanceDecreasingTransaction(
      BalanceDecreasingTransaction.Proof calldata _proof
   ) external view returns (bool _proved) {
      return _proof.data.attestationType == bytes32("BalanceDecreasingTransaction") &&
         _proof.merkleProof.verify(
            merkleRootStorage.merkleRoot(_proof.data.votingRound),
            keccak256(abi.encode(_proof.data))
         );
   }
}
```

If you remember the payment verification contract, this one is very similar.
We still use the `MerkleProof` library to verify the proof, but the type we verify is different.
We just abi encode the response and hash it, and then we verify that the hash is included in the Merkle tree for the round - in exactly the same way as with the payment type.
And all the others are very similar, just the type we verify is different.
Importantly, the verification contract just checks that this proof indeed proves, that the structure we requested was included in specific round, it does not make any assumptions about the response itself.
The response itself should be checked by the dapp to make sure, it is the one you expect.
In some cases, the verifiers will not even confirm response (as there is no such confirmation), but in this case, they might confirm the response, but also indicate that the balance has not decreased (and has indeed increased).


<!-- TODO:Example, if possible with XRPL clawback -->

### Confirmed Block Height Exists

We now know how to observe generic transactions and balance decreasing transactions.
It would be great, if there was a way to somehow get information about the block production rate on the external chain.
This has multiple use cases - for example, you can check what is the current top block on the chain and then check if this might be near the timestamp that the transaction on external chain should happen.
It is also a good way to observe if other chain is progressing and not halted.

Let's see the type specification:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

/**
 * @custom:name ConfirmedBlockHeightExists
 * @custom:id 0x03
 * @custom:supported BTC, DOGE, XRP, testBTC, testDOGE, testXRP
 * @author Flare
 * @notice An assertion that a block with `blockNumber` is confirmed.
 * It also provides data to compute the block production rate in the given time range.
 * @custom:verification It is checked that the block with `blockNumber` is confirmed by at least `numberOfConfirmations`.
 * If it is not, the request is rejected. We note a block on the tip of the chain is confirmed by 1 block.
 * Then `lowestQueryWindowBlock` is determined and its number and timestamp are extracted.
 *
 *
 *  Current confirmation heights consensus:
 *
 *
 * | `Chain` | `chainId` | `numberOfConfirmations` | `timestamp ` |
 * | ------- | --------- | ----------------------- | ------------ |
 * | `BTC`   | 0         | 6                       | mediantime   |
 * | `DOGE`  | 2         | 60                      | mediantime   |
 * | `XRP`   | 3         | 3                       | close_time   |
 *
 *
 *
 *
 * @custom:lut `lowestQueryWindowBlockTimestamp`
 */
interface ConfirmedBlockHeightExists {
    /**
     * @notice Toplevel request
     * @param attestationType ID of the attestation type.
     * @param sourceId ID of the data source.
     * @param messageIntegrityCode `MessageIntegrityCode` that is derived from the expected response as defined.
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
     * @notice Request body for ConfirmedBlockHeightExistsType attestation type
     * @param blockNumber The number of the block the request wants a confirmation of.
     * @param queryWindow The length of the period in which the block production rate is to be computed.
     */
    struct RequestBody {
        uint64 blockNumber;
        uint64 queryWindow;
    }

    /**
     * @notice Response body for ConfirmedBlockHeightExistsType attestation type
     * @custom:below `blockNumber`, `lowestQueryWindowBlockNumber`, `blockTimestamp` and `lowestQueryWindowBlockTimestamp` can be used to compute the average block production time in the specified block range.
     * @param blockTimestamp The timestamp of the block with `blockNumber`.
     * @param numberOfConfirmations The depth at which a block is considered confirmed depending on the chain. All attestation providers must agree on this number.
     * @param lowestQueryWindowBlockNumber The block number of the latest block that has a timestamp strictly smaller than `blockTimestamp` - `queryWindow`.
     * @param lowestQueryWindowBlockTimestamp The timestamp of the block at height `lowestQueryWindowBlockNumber`.
     */
    struct ResponseBody {
        uint64 blockTimestamp;
        uint64 numberOfConfirmations;
        uint64 lowestQueryWindowBlockNumber;
        uint64 lowestQueryWindowBlockTimestamp;
    }
}
```

The request body is pretty simple.
We provide the `blockNumber` we want to confirm exists on chain and the `queryWindow` - the length of the period in which the block production rate is to be computed (relative to the timestamp of the block we are requesting).
Importantly, for the block to be considered visible, at least `X` blocks above must be confirmed - this ensures, that we do not confirm blocks that are not on the main chain.
The numbers of confirmations are different for each chain and are listed in the specification.

What do we get in return?
Remember, as per spec, we only get the information that the block with `blockNumber` is confirmed by at least `numberOfConfirmations`.
If the block is not confirmed, the request is rejected (none of the attestation clients will confirm the response and it will not be included in the Merkle tree).
The response body contains the following fields:
- `blockTimestamp` - the timestamp of the block with `blockNumber`.
- `numberOfConfirmations` - the depth at which a block is considered confirmed depending on the chain. This is fixed per chain and the same as in the specification.
- `lowestQueryWindowBlockNumber` - the block number of the latest block that has a timestamp strictly smaller than `blockTimestamp` - `queryWindow`. This allows us to gauge the average block production time in the specified block range.
- `lowestQueryWindowBlockTimestamp` - the timestamp of the block at height `lowestQueryWindowBlockNumber`. So the time when the block was produced.

This attestation type is also useful to see another important thing - the `INDETERMINATE` response.
What does that mean?
It means that the attestation can't be confirmed (yet), as there is not enough confirmations for the block.
In this case, the response is `INDETERMINATE` - so not confirmed, but it does indicate, that it might be valid in the future (it at least indicates that the attestation client can't reject it for sure).

Go, take the following code and try to see how `prepareResponse` fares for bocks, that are out of range for current confirmation limit.

<!-- TODO:Example -->

### Reference Payment Nonexistence

You are getting more and more familiar with the attestation types and you are starting to see, that they are very powerful and can be used in many different ways.
Let's check a bit more involved one - the `ReferencePaymentNonexistence` type.

This one is a bit more difficult to implement and properly use, as we are forcing the attestation client to do a lot of work - they need to prove that a certain payment has not been made.
In that case, instead of looking at the transaction and checking if it is valid, we are going to be looking at the block range and checking that no valid payment conforming to our requirements has been made in the specified block range.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

/**
 * @custom:name ReferencedPaymentNonexistence
 * @custom:id 0x04
 * @custom:supported BTC, DOGE, XRP, testBTC, testDOGE, testXRP
 * @author Flare
 * @notice Assertion that an agreed-upon payment has not been made by a certain deadline.
 * A confirmed request shows that a transaction meeting certain criteria (address, amount, reference) did not appear in the specified block range.
 * 
 * 
 * This type of attestation can be used to e.g. provide grounds to liquidate funds locked by a smart contract on Flare when a payment is missed. 
 *
 * @custom:verification If `firstOverflowBlock` cannot be determined or does not have a sufficient [number of confirmations](/specs/attestations/configs.md#finalityconfirmation), the attestation request is rejected.
 * If `firstOverflowBlockNumber` is higher or equal to `minimalBlockNumber`, the request is rejected.
 * The search range are blocks between heights including `minimalBlockNumber` and excluding `firstOverflowBlockNumber`.
 * If the verifier does not have a view of all blocks from `minimalBlockNumber` to `firstOverflowBlockNumber`, the attestation request is rejected.
 *
 * The request is confirmed if no transaction meeting the specified criteria is found in the search range.
 * The criteria and timestamp are chain specific.
 * ### UTXO (Bitcoin and Dogecoin)
 *
 *
 * Criteria for the transaction:
 *
 *
 * - It is not coinbase transaction.
 * - The transaction has the specified [standardPaymentReference](/specs/attestations/external-chains/standardPaymentReference.md#btc-and-doge-blockchains).
 * - The sum of values of all outputs with the specified address minus the sum of values of all inputs with the specified address is greater than `amount` (in practice the sum of all values of the inputs with the specified address is zero).
 *
 * 
 * Timestamp is `mediantime`.

 * ### XRPL
 *
 *
 *
 * Criteria for the transaction:
 * - The transaction is of type payment.
 * - The transaction has the specified [standardPaymentReference](/specs/attestations/external-chains/standardPaymentReference.md#xrp),
 * - One of the following is true:
 *   - Transaction status is `SUCCESS` and the amount received by the specified destination address is greater than the specified `value`.
 *   - Transaction status is `RECEIVER_FAILURE` and the specified destination address would receive an amount greater than the specified `value` had the transaction been successful.
 *
 * 
 * Timestamp is `close_time` converted to UNIX time.
 *
 * @custom:lut `minimalBlockTimestamp`
 */
interface ReferencedPaymentNonexistence {
    /**
     * @notice Toplevel request
     * @param attestationType ID of the attestation type.
     * @param sourceId ID of the data source.
     * @param messageIntegrityCode `MessageIntegrityCode` that is derived from the expected response as defined.
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
     * @notice Request body for ReferencePaymentNonexistence attestation type
     * @param minimalBlockNumber The start block of the search range.
     * @param deadlineBlockNumber The blockNumber to be included in the search range.
     * @param deadlineTimestamp The timestamp to be included in the search range.
     * @param destinationAddressHash The standard address hash of the address to which the payment had to be done.
     * @param amount The requested amount in minimal units that had to be payed.
     * @param standardPaymentReference The requested standard payment reference.
     * @custom:below The `standardPaymentReference` should not be zero (as a 32-byte sequence).
     */
    struct RequestBody {
        uint64 minimalBlockNumber;
        uint64 deadlineBlockNumber;
        uint64 deadlineTimestamp;
        bytes32 destinationAddressHash;
        uint256 amount;
        bytes32 standardPaymentReference;
    }

    /**
     * @notice Response body for ReferencePaymentNonexistence attestation type.
     * @param minimalBlockTimestamp The timestamp of the minimalBlock.
     * @param firstOverflowBlockNumber The height of the firstOverflowBlock.
     * @param firstOverflowBlockTimestamp The timestamp of the firstOverflowBlock.
     * @custom:below `firstOverflowBlock` is the first block that has block number higher than `deadlineBlockNumber` and timestamp later than `deadlineTimestamp`.
     * The specified search range are blocks between heights including `minimalBlockNumber` and excluding `firstOverflowBlockNumber`.
     */
    struct ResponseBody {
        uint64 minimalBlockTimestamp;
        uint64 firstOverflowBlockNumber;
        uint64 firstOverflowBlockTimestamp;
    }
}
```


The request body is a bit bigger this time, as we have to specify the range of blocks we want to check and the criteria for the payment we want to check.
- `minimalBlockNumber` - the start block of the search range.
- `deadlineBlockNumber` - the blockNumber to be included in the search range.
- `deadlineTimestamp` - the timestamp to be included in the search range.
As we include both block number and timestamp, the requested range will be the such, that it will include all blocks from `minimalBlockNumber` to `deadlineBlockNumber` and all blocks with timestamps from `minimalBlockTimestamp` to `deadlineTimestamp`.
- `destinationAddressHash` - the standard address hash of the address to which the payment had to be done.
- `amount` - the requested amount in minimal units that had to be payed. The amount is chain specific.
- `standardPaymentReference` - the requested standard payment reference. This is the reference that the payment had to have.

The response body is a bit simpler and essentially contains the searched range
- `minimalBlockTimestamp` - the timestamp of the minimalBlock that was included in the search range - this is the timestamp of the block with `minimalBlockNumber`.
- `firstOverflowBlockNumber` - the height of the firstOverflowBlock. This is the first block that has block number higher than `deadlineBlockNumber` AND timestamp later than `deadlineTimestamp`.
- `firstOverflowBlockTimestamp` - the timestamp of the firstOverflowBlock. This is the timestamp of the first block that has block number higher than `deadlineBlockNumber` AND timestamp later than `deadlineTimestamp`.

If the request is confirmed, it means that there was no payment in such range (including minimal block, but excluding maximal block) with amount greater than or equal to the requested amount and with the requested reference.

The full rules for verification are quite complex (and chain dependent) and are available in the [specification](https://github.com/flare-foundation/songbird-state-connector-protocol/blob/main/specs/attestations/active-types/ReferencedPaymentNonexistence.md#verification), but the important thing is, that the request is confirmed if no transaction meeting the specified criteria is found in the search range.

<!--TODO: code example -->

Keep in mind, that the requested range can be quite large, so the verifiers might not be able to confirm the response (as they might not have the view of all blocks from `minimalBlockNumber` to `firstOverflowBlockNumber`), so the request might be rejected.


### AddressValidity

This is a very simple attestation type, that is able to prove that the string constitutes a valid address on the specified chain.
Importantly, different from the `Payment` type we saw in the previous blog, this type does not require a transaction to be proven, it just offloads the computation of the address validity to the verifier so that expensive computation does not have to be done on-chain.
This is useful if you want to make sure that the address is valid before using it in your protocol.
The fAssets, for example, need to make sure that the address is valid before they can be used in the protocol, and this is a good way to offload difficult computation (https://bitcoin.design/guide/glossary/address/) on when the bitcoin address is valid off-chain entities.

Let's see the specification:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

/**
 * @custom:name AddressValidity
 * @custom:id 0x05
 * @custom:supported BTC, DOGE, XRP, testBTC, testDOGE, testXRP
 * @author Flare
 * @notice An assertion whether a string represents a valid address on an external chain.
 * @custom:verification The address is checked against all validity criteria of the chain with `sourceId`.
 * Indicator of validity is provided.
 * If the address is valid, its standard form and standard hash are computed.
 * Validity criteria for each supported chain:
 * - [BTC](/specs/attestations/external-chains/address-validity/BTC.md)
 * - [DOGE](/specs/attestations/external-chains/address-validity/DOGE.md)
 * - [XRPL](/specs/attestations/external-chains/address-validity/XRPL.md)
 * @custom:lut `0xffffffffffffffff` ($2^{64}-1$ in hex)
 */
interface AddressValidity {
    /**
     * @notice Toplevel request
     * @param attestationType ID of the attestation type.
     * @param sourceId Id of the data source.
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
     * @notice Request body for AddressValidity attestation type
     * @param addressStr Address to be verified.
     */
    struct RequestBody {
        string addressStr;
    }

    /**
     * @notice Response body for AddressValidity attestation type
     * @param isValid Boolean indicator of the address validity.
     * @param standardAddress If `isValid`, standard form of the validated address. Otherwise an empty string.
     * @param standardAddressHash If `isValid`, standard address hash of the validated address. Otherwise a zero bytes32 string.
     */
    struct ResponseBody {
        bool isValid;
        string standardAddress;
        bytes32 standardAddressHash;
    }
}
```

The request body is very simple - it just contains the `addressStr` - the address to be verified according to the chain's rules.

The response body has all the meat - the request can always be confirmed (in general), we want to take a look at specific fields:
- `isValid` - a boolean indicator of the address validity.
If this is true, the address is valid according to the chain's rules.
Remember, the merkle proof is about the validity of this request (if it was confirmed by the verifiers), not about the meaning of its response - wether the address is valid or not.
- `standardAddress` - if `isValid`, this is the standard form of the validated address. Otherwise an empty string.
This is useful if you want to use the address in your protocol - you can use the standard form of the address and not worry about the different representations of the same address.
- `standardAddressHash` - if `isValid`, this is the standard address hash of the validated address, otherwise a zero bytes32 string.
This is useful to verify with the standard address hash returned by `Payment` and `ReferencedPaymentNonexistence`.

<!--TODO: code-->

Think of this more of as an example of what can be offloaded to off-chain computation (and verification) - and try to imagine what other things that are prohibitively expensive (or impossible due to data unavailability) on-chain can be offloaded to off-chain computation.

