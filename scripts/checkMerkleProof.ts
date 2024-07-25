import flareLib = require("@flarenetwork/flare-periphery-contract-artifacts");

import hardhat, { ethers } from "hardhat";

export async function checkMerkleProof(scRound: number) {
  // Check that the round is already finalized
  const stateConnector = await ethers.getContractAt(
    flareLib.nameToAbi("IStateConnector", "coston").data,
    flareLib.nameToAddress("StateConnector", "coston")
  );

  const lastFinalized = await stateConnector.lastFinalizedRoundId();

  if (scRound > lastFinalized) {
    console.log("scRound:", scRound, "is not finalized yet");
    return;
  }
  // Where is the requestMerkleProof function?
  const response = await requestMerkleProof(scRound);

  const paymentVerifier = await ethers.getContractAt(
    flareLib.nameToAbi("IPaymentVerification", "coston").data,
    flareLib.nameToAddress("IPaymentVerification", "coston")
  );
  const payment = {
    data: response.data.response,
    merkleProof: response.data.merkleProof,
  };

  const tx = await paymentVerifier.verifyPayment(payment);
  console.log("Verification tx:", tx);
  return payment;
}
