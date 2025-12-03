"use client";

import { useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { encodePacked, keccak256 } from "viem";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { BugAntIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";

// Helper to convert ArrayBuffer to hex string
const bufferToHex = (buffer: ArrayBuffer): `0x${string}` => {
  return `0x${Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
};

// Parse SPKI public key to extract x and y coordinates
// getPublicKey() returns SubjectPublicKeyInfo (SPKI) format, not raw COSE
const parseSpkiPublicKey = (spkiKey: ArrayBuffer): { x: `0x${string}`; y: `0x${string}` } => {
  // SPKI format for P-256:
  // SEQUENCE {
  //   SEQUENCE {
  //     OBJECT IDENTIFIER ecPublicKey (1.2.840.10045.2.1)
  //     OBJECT IDENTIFIER prime256v1 (1.2.840.10045.3.1.7)
  //   }
  //   BIT STRING (uncompressed point: 04 || x[32] || y[32])
  // }

  const bytes = new Uint8Array(spkiKey);

  // Find the uncompressed point (starts with 0x04)
  // It's typically at the end of the SPKI structure
  // For P-256, the public key is 65 bytes: 04 + 32 bytes x + 32 bytes y
  let pointStart = -1;

  for (let i = 0; i < bytes.length - 64; i++) {
    if (bytes[i] === 0x04) {
      // Verify this looks like a valid uncompressed point
      // by checking we have enough bytes remaining
      if (i + 65 <= bytes.length) {
        pointStart = i;
        break;
      }
    }
  }

  // If we didn't find 0x04, try looking for the BIT STRING marker (0x03)
  // and skip the length and unused bits byte
  if (pointStart === -1) {
    for (let i = 0; i < bytes.length - 67; i++) {
      if (bytes[i] === 0x03) {
        // 0x03 = BIT STRING tag
        const len = bytes[i + 1];
        if (len === 66 && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x04) {
          // len=66: 1 byte unused bits + 65 bytes point
          // bytes[i+2]=0x00: no unused bits
          // bytes[i+3]=0x04: uncompressed point marker
          pointStart = i + 3;
          break;
        }
      }
    }
  }

  if (pointStart === -1) {
    console.error(
      "SPKI bytes:",
      Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join(" "),
    );
    throw new Error("Could not find uncompressed point in SPKI public key");
  }

  // Extract x and y (each 32 bytes, after the 0x04 marker)
  const x = bufferToHex(spkiKey.slice(pointStart + 1, pointStart + 33));
  const y = bufferToHex(spkiKey.slice(pointStart + 33, pointStart + 65));

  return { x, y };
};

// Parse DER-encoded signature to r and s values
const parseDerSignature = (derSig: ArrayBuffer): { r: `0x${string}`; s: `0x${string}` } => {
  const bytes = new Uint8Array(derSig);
  // DER format: 0x30 <len> 0x02 <r_len> <r> 0x02 <s_len> <s>

  if (bytes[0] !== 0x30) {
    throw new Error("Invalid DER signature");
  }

  let offset = 2; // Skip 0x30 and total length

  if (bytes[offset] !== 0x02) {
    throw new Error("Invalid DER signature - expected 0x02 for r");
  }
  offset++;

  const rLen = bytes[offset];
  offset++;

  // r might have a leading 0x00 if high bit is set
  let rStart = offset;
  let rActualLen = rLen;
  if (bytes[rStart] === 0x00 && rLen > 32) {
    rStart++;
    rActualLen--;
  }

  const rBytes = new Uint8Array(32);
  const rSource = bytes.slice(rStart, rStart + Math.min(rActualLen, 32));
  rBytes.set(rSource, 32 - rSource.length);
  const r = bufferToHex(rBytes.buffer) as `0x${string}`;

  offset += rLen;

  if (bytes[offset] !== 0x02) {
    throw new Error("Invalid DER signature - expected 0x02 for s");
  }
  offset++;

  const sLen = bytes[offset];
  offset++;

  // s might have a leading 0x00 if high bit is set
  let sStart = offset;
  let sActualLen = sLen;
  if (bytes[sStart] === 0x00 && sLen > 32) {
    sStart++;
    sActualLen--;
  }

  const sBytes = new Uint8Array(32);
  const sSource = bytes.slice(sStart, sStart + Math.min(sActualLen, 32));
  sBytes.set(sSource, 32 - sSource.length);
  const s = bufferToHex(sBytes.buffer) as `0x${string}`;

  // Handle signature malleability - ensure s is in lower half
  const N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
  const halfN = N / 2n;
  let sBigInt = BigInt(s);
  if (sBigInt > halfN) {
    sBigInt = N - sBigInt;
  }
  const sNormalized = `0x${sBigInt.toString(16).padStart(64, "0")}` as `0x${string}`;

  return { r, s: sNormalized };
};

// Find index of a substring in a string
const findIndex = (str: string, substr: string): number => {
  return str.indexOf(substr);
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  // Passkey state
  const [credentialId, setCredentialId] = useState<`0x${string}` | null>(null);
  const [publicKeyX, setPublicKeyX] = useState<`0x${string}` | null>(null);
  const [publicKeyY, setPublicKeyY] = useState<`0x${string}` | null>(null);
  const [rawCredentialId, setRawCredentialId] = useState<ArrayBuffer | null>(null);
  const [greetingInput, setGreetingInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastGasUsed, setLastGasUsed] = useState<bigint | null>(null);

  // Derive passkey address from public key (same formula as contract)
  const derivedPasskeyAddress =
    publicKeyX && publicKeyY
      ? (`0x${BigInt(keccak256(`${publicKeyX}${publicKeyY.slice(2)}` as `0x${string}`))
          .toString(16)
          .slice(-40)
          .padStart(40, "0")}` as `0x${string}`)
      : null;

  // Read current greeting
  const { data: currentGreeting } = useScaffoldReadContract({
    contractName: "YourContract",
    functionName: "greeting",
  });

  // Read greeting setter address
  const { data: greetingSetterAddress } = useScaffoldReadContract({
    contractName: "YourContract",
    functionName: "greetingSetter",
  });

  // Write contracts
  const { writeContractAsync: registerPasskeyAsync } = useScaffoldWriteContract({
    contractName: "YourContract",
  });

  const { writeContractAsync: setGreetingWithPasskeyAsync } = useScaffoldWriteContract({
    contractName: "YourContract",
  });

  // Create a new passkey
  const handleCreatePasskey = async () => {
    setIsRegistering(true);
    setStatusMessage(null);

    try {
      // Generate a random challenge for registration
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: {
            name: "Scaffold-ETH 2 Passkey Demo",
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16),
            name: connectedAddress || "anonymous",
            displayName: connectedAddress || "Anonymous User",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 }, // ES256 (P-256)
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Failed to create credential");
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Hash the raw credential ID to get a bytes32
      const rawId = credential.rawId;
      setRawCredentialId(rawId);
      const credIdHash = keccak256(bufferToHex(rawId));
      setCredentialId(credIdHash);

      // Parse the public key from attestation
      const publicKey = response.getPublicKey();
      if (!publicKey) {
        throw new Error("Failed to get public key");
      }

      const { x, y } = parseSpkiPublicKey(publicKey);
      setPublicKeyX(x);
      setPublicKeyY(y);

      setStatusMessage(`Passkey created! Credential ID: ${credIdHash.slice(0, 10)}...`);
    } catch (error) {
      console.error("Error creating passkey:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRegistering(false);
    }
  };

  // Register passkey on-chain
  const handleRegisterOnChain = async () => {
    if (!credentialId || !publicKeyX || !publicKeyY) {
      setStatusMessage("Please create a passkey first");
      return;
    }

    setStatusMessage("Registering passkey on-chain...");

    try {
      await registerPasskeyAsync({
        functionName: "registerPasskey",
        args: [credentialId, publicKeyX, publicKeyY],
      });

      setStatusMessage("Passkey registered on-chain successfully!");
    } catch (error) {
      console.error("Error registering passkey:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Sign greeting with passkey and submit
  const handleSignAndSubmit = async () => {
    if (!credentialId || !rawCredentialId) {
      setStatusMessage("Please create and register a passkey first");
      return;
    }

    if (!greetingInput.trim()) {
      setStatusMessage("Please enter a greeting message");
      return;
    }

    setIsSigning(true);
    setStatusMessage(null);

    try {
      // Create challenge from greeting hash
      const greetingHash = keccak256(encodePacked(["string"], [greetingInput]));
      const challengeBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        challengeBytes[i] = parseInt(greetingHash.slice(2 + i * 2, 4 + i * 2), 16);
      }

      // Sign with passkey
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          rpId: window.location.hostname,
          allowCredentials: [
            {
              type: "public-key",
              id: rawCredentialId,
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (!assertion) {
        throw new Error("Failed to get assertion");
      }

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

      // Parse the signature
      const { r, s } = parseDerSignature(assertionResponse.signature);

      // Get authenticator data and client data JSON
      const authenticatorData = bufferToHex(assertionResponse.authenticatorData);
      const clientDataJSON = new TextDecoder().decode(assertionResponse.clientDataJSON);

      // Find indices for challenge and type in clientDataJSON
      const challengeIndex = findIndex(clientDataJSON, '"challenge"');
      const typeIndex = findIndex(clientDataJSON, '"type"');

      if (challengeIndex === -1 || typeIndex === -1) {
        throw new Error("Could not find challenge or type in clientDataJSON");
      }

      setStatusMessage("Submitting to contract...");

      // Submit to contract and capture gas used
      await setGreetingWithPasskeyAsync(
        {
          functionName: "setGreetingWithPasskey",
          args: [
            greetingInput,
            credentialId,
            {
              r: r,
              s: s,
              challengeIndex: BigInt(challengeIndex),
              typeIndex: BigInt(typeIndex),
              authenticatorData: authenticatorData,
              clientDataJSON: clientDataJSON,
            },
          ],
        },
        {
          onBlockConfirmation: txReceipt => {
            setLastGasUsed(txReceipt.gasUsed);
            console.log("⛽ Gas used for passkey verification:", txReceipt.gasUsed.toString());
          },
        },
      );

      setStatusMessage("Greeting updated successfully with passkey signature!");
      setGreetingInput("");
    } catch (error) {
      console.error("Error signing/submitting:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Welcome to</span>
            <span className="block text-4xl font-bold">Scaffold-ETH 2</span>
          </h1>
          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address
              address={connectedAddress}
              chain={targetNetwork}
              blockExplorerAddressLink={
                targetNetwork.id === hardhat.id ? `/blockexplorer/address/${connectedAddress}` : undefined
              }
            />
          </div>

          {/* Passkey Section */}
          <div className="mt-8 bg-base-200 rounded-3xl p-6 max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-center mb-4">🔐 Passkey Greeting</h2>
            <p className="text-center mb-4 text-sm opacity-70">
              Sign a greeting message using WebAuthn passkeys, verified on-chain with secp256r1
            </p>

            {/* Current Greeting */}
            <div className="bg-base-100 rounded-xl p-4 mb-4">
              <p className="text-sm opacity-70">Current Greeting:</p>
              <p className="text-lg font-semibold mb-2">{currentGreeting || "Loading..."}</p>
              {greetingSetterAddress &&
                typeof greetingSetterAddress === "string" &&
                greetingSetterAddress !== "0x0000000000000000000000000000000000000000" && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="opacity-70">Set by:</span>
                    <Address address={greetingSetterAddress as `0x${string}`} chain={targetNetwork} />
                    {publicKeyX && publicKeyY && derivedPasskeyAddress && (
                      <span className="badge badge-primary badge-sm">
                        {greetingSetterAddress.toLowerCase() === derivedPasskeyAddress.toLowerCase()
                          ? "🔐 Your Passkey"
                          : ""}
                      </span>
                    )}
                  </div>
                )}
            </div>

            {/* Step 1: Create Passkey */}
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Step 1: Create Passkey</h3>
              <button
                className={`btn btn-primary w-full ${isRegistering ? "loading" : ""}`}
                onClick={handleCreatePasskey}
                disabled={isRegistering}
              >
                {isRegistering ? "Creating..." : credentialId ? "✓ Passkey Created" : "Create Passkey"}
              </button>
              {credentialId && (
                <p className="text-xs mt-2 opacity-70 break-all">Credential ID: {credentialId.slice(0, 20)}...</p>
              )}
            </div>

            {/* Step 2: Register On-Chain */}
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Step 2: Register On-Chain</h3>
              <button
                className="btn btn-secondary w-full"
                onClick={handleRegisterOnChain}
                disabled={!credentialId || !publicKeyX || !publicKeyY}
              >
                Register Passkey On-Chain
              </button>
            </div>

            {/* Step 3: Sign and Submit Greeting */}
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Step 3: Sign & Submit Greeting</h3>
              <input
                type="text"
                placeholder="Enter your greeting..."
                className="input input-bordered w-full mb-2"
                value={greetingInput}
                onChange={e => setGreetingInput(e.target.value)}
              />
              <button
                className={`btn btn-accent w-full ${isSigning ? "loading" : ""}`}
                onClick={handleSignAndSubmit}
                disabled={!credentialId || !greetingInput.trim() || isSigning}
              >
                {isSigning ? "Signing..." : "Sign with Passkey & Submit"}
              </button>
            </div>

            {/* Gas Usage Display */}
            {lastGasUsed && (
              <div className="bg-base-100 rounded-xl p-4 mb-4">
                <p className="text-sm opacity-70">Last Signature Verification Gas:</p>
                <p className="text-lg font-mono font-bold text-primary">⛽ {lastGasUsed.toLocaleString()} gas</p>
                <p className="text-xs opacity-50 mt-1">
                  This is the on-chain cost to verify the secp256r1 passkey signature
                </p>
              </div>
            )}

            {/* Status Message */}
            {statusMessage && (
              <div
                className={`alert ${statusMessage.includes("Error") ? "alert-error" : "alert-success"} mt-4 text-sm`}
              >
                {statusMessage}
              </div>
            )}
          </div>

          <p className="text-center text-lg mt-8">
            Get started by editing{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              packages/nextjs/app/page.tsx
            </code>
          </p>
          <p className="text-center text-lg">
            Edit your smart contract{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              YourContract.sol
            </code>{" "}
            in{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              packages/foundry/contracts
            </code>
          </p>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <BugAntIcon className="h-8 w-8 fill-secondary" />
              <p>
                Tinker with your smart contract using the{" "}
                <Link href="/debug" passHref className="link">
                  Debug Contracts
                </Link>{" "}
                tab.
              </p>
            </div>
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <MagnifyingGlassIcon className="h-8 w-8 fill-secondary" />
              <p>
                Explore your local transactions with the{" "}
                <Link href="/blockexplorer" passHref className="link">
                  Block Explorer
                </Link>{" "}
                tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
