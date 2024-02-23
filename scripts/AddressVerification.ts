const exampleXRPLAddress = "r9RLXvWuRro3RX33pk4xsN58tefYZ8Tvbj"
const satoshiBTCAddress = "TODO" // TODO: fix me

async function prepareAttestationResponse(attestationType: string, network: string, sourceId: string, requestBody: any): Promise<AttestationResponse> {
    const response = await fetch(
        `${ATTESTATION_URL}/verifier/${network}/${attestationType}/prepareResponse`,
        {
            method: "POST",
            headers: { "X-API-KEY": ATTESTATION_API_KEY as string, "Content-Type": "application/json" },
            body: JSON.stringify({
                "attestationType": toHex(attestationType),
                "sourceId": toHex(sourceId),
                "requestBody": requestBody
            })
        }
    );
    const data = await response.json();
    return data;
}

async function main() {

    console.log(
        prepareAttestationResponse("AddressVerification", "xrp", "testXRP",
            { addressStr: exampleXRPLAddress })
    )

    console.log(
        prepareAttestationResponse("AddressVerification", "xrp", "testXRP",
            { addressStr: "0xhahahahaha" })
    )
    console.log(
        prepareAttestationResponse("AddressVerification", "xrp", "testXRP",
            { addressStr: "Hello world!" })
    )

    console.log(
        prepareAttestationResponse("AddressVerification", "btc", "testBTC",
            { addressStr: satoshiBTCAddress })
    )

    console.log(
        prepareAttestationResponse("AddressVerification", "btc", "testBTC",
            { addressStr: "0xhahahahaha" })
    )
    console.log(
        prepareAttestationResponse("AddressVerification", "btc", "testBTC",
            { addressStr: "Hello world!" })
    )

    await sendXRPLTransaction("Hello world!")
}

main().then(() => process.exit(0))
