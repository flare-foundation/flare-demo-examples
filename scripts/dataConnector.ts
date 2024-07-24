// import "dotenv/config";
import flareLib = require("@flarenetwork/flare-periphery-contract-artifacts");
import fetch from "node-fetch";
import hardhat, { ethers } from "hardhat";

// Constants
const API_KEY = "123456";
const ATTESTATION_URL = "https://attestation-coston.aflabs.net";

// Simple hex encoding
function toHex(data: any) {
  var result = "";
  for (var i = 0; i < data.length; i++) {
    result += data.charCodeAt(i).toString(16);
  }
  return result;
}

const BTC_TRANSACTION_ID =
  "0x" + "01c17d143c03b459707f540fd5ee9f02a730c4cd114f310ef294b706ccf131d1";

async function prepareRequest() {
  const attestationType = toHex("Payment"); // Attestation Type
  const sourceType = toHex("testBTC");
  // Attestation Request object to be sent to API endpoint
  const requestData = {
    attestationType: attestationType,
    sourceId: sourceType,
    requestBody: {
      transactionId: BTC_TRANSACTION_ID,
      inUtxo: "3",
      utxo: "4",
    },
  };
  // Submit TX to a verifier
  const response = await fetch(
    `${ATTESTATION_URL}/verifier/btc/Payment/prepareRequest`,
    {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    }
  );
  const data = await response.json();
  console.log("hello");
  console.log("Prepared request:", data);
  return data;
}

// Make attestation request
async function submitRequest() {
  const requestData: any = await prepareRequest();

  const stateConnector = await ethers.getContractAt(
    flareLib.nameToAbi("IStateConnector", "coston").data,
    flareLib.nameToAddress("StateConnector", "coston")
  );

  // Call to the StateConnector protocol to provide attestation.
  const tx = await stateConnector.requestAttestations(
    requestData.abiEncodedRequest
  );
  const receipt = await tx.wait();

  // Get block number of the block containing contract call
  const blockNumber = receipt.blockNumber;
  const block = await ethers.provider.getBlock(blockNumber);

  // Get constants from Data Connector smart contract
  const BUFFER_TIMESTAMP_OFFSET = Number(
    await stateConnector.BUFFER_TIMESTAMP_OFFSET()
  );
  const BUFFER_WINDOW = Number(await stateConnector.BUFFER_WINDOW());

  // Calculate roundId
  const roundId = Math.floor(
    (block!.timestamp - BUFFER_TIMESTAMP_OFFSET) / BUFFER_WINDOW
  );
  console.log("scRound:", roundId);
  return roundId;
}

// Obtain response data without proof
async function getPreparedResponse() {
  const attestationType = toHex("Payment");
  const sourceType = toHex("testBTC");
  // Attestation Request object to be sent to API endpoint
  const requestData = {
    attestationType: attestationType,
    sourceId: sourceType,
    requestBody: {
      transactionId: BTC_TRANSACTION_ID,
      inUtxo: "8",
      utxo: "4",
    },
  };

  const response = await fetch(
    `${ATTESTATION_URL}/verifier/btc/Payment/prepareResponse`,
    {
      method: "POST",
      headers: {
        "X-API-KEY": ATTESTATION_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    }
  );
  const data = await response.json();
  console.log("Prepared response:", data);
  return data;
}
