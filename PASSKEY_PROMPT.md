# Passkey Signature Verification - One-Shot Prompt

Use this prompt with an AI assistant in a Scaffold-ETH 2 codebase to build passkey (WebAuthn) signature verification using the secp256r1 precompile.

---

## The Prompt

```
Build a passkey signature verification system for Scaffold-ETH 2 that:

**Smart Contract (YourContract.sol):**
- Import OpenZeppelin's WebAuthn library: `@openzeppelin/contracts/utils/cryptography/WebAuthn.sol`
- Store passkey public keys on-chain with mappings:
  - `mapping(bytes32 => bool) registeredCredentials`
  - `mapping(bytes32 => bytes32) credentialPubKeyX`
  - `mapping(bytes32 => bytes32) credentialPubKeyY`
- Add `registerPasskey(bytes32 credentialId, bytes32 qx, bytes32 qy)` to store public keys
- Add `setGreetingWithPasskey(string _newGreeting, bytes32 credentialId, WebAuthn.WebAuthnAuth memory auth)` that:
  - Verifies the signature using `WebAuthn.verify(challenge, auth, qx, qy)`
  - The challenge should be `abi.encodePacked(keccak256(abi.encodePacked(_newGreeting)))`
  - Updates the greeting and stores the derived passkey address as the setter
- Add `getPasskeyAddress(bytes32 qx, bytes32 qy)` that derives an address: `address(uint160(uint256(keccak256(abi.encodePacked(qx, qy)))))`
- Add `greetingSetter` state variable to track who set the greeting
- Emit events: `PasskeyRegistered` and `GreetingChangeWithPasskey`

**Frontend (page.tsx):**
- Add a 3-step UI: Create Passkey → Register On-Chain → Sign & Submit Greeting
- Use `navigator.credentials.create()` with ES256 algorithm (-7) for P-256 curve
- Parse the SPKI public key from `response.getPublicKey()` to extract x,y coordinates (find the 0x04 uncompressed point marker, then read 32 bytes for x and 32 bytes for y)
- Hash the rawId with keccak256 to create the credentialId
- For signing, use `navigator.credentials.get()` with the greeting hash as the challenge
- Parse the DER signature to extract r,s values (handle leading zeros and normalize s for malleability)
- Find `"challenge"` and `"type"` indices in clientDataJSON
- Call the contract with the WebAuthnAuth struct containing: r, s, challengeIndex, typeIndex, authenticatorData, clientDataJSON
- Display the current greeting with the setter's address
- Show gas used after transactions to demonstrate precompile efficiency

**Key Implementation Details:**
- The secp256r1 precompile is at address 0x100 (RIP-7212)
- On mainnet with precompile: ~50-80k gas total
- Without precompile (local): ~450k gas (Solidity fallback)
- Signature malleability: normalize s to lower half of curve order N
- SPKI format: look for 0x04 marker or BIT STRING (0x03) tag to find the uncompressed point
- DER signature: 0x30 <len> 0x02 <r_len> <r> 0x02 <s_len> <s>

**Configuration:**
- Target mainnet in scaffold.config.ts for the precompile
- Remove console.log imports before mainnet deployment
```

---

## What Gets Built

### Contract (~75 lines)
- Passkey registration and storage
- WebAuthn signature verification via secp256r1 precompile
- Greeting updates with passkey signatures
- Derived "passkey address" tracking

### Frontend Features
- Create passkey with biometrics (Touch ID, Face ID, etc.)
- Register passkey public key on-chain
- Sign messages with passkey
- Verify signatures on-chain
- Display who set the greeting (EOA or passkey address)
- Show gas usage for signature verification

### Tech Stack
- OpenZeppelin WebAuthn.sol + P256.sol
- WebAuthn Browser API
- secp256r1/P-256 curve (same as Apple Secure Enclave, Android Keystore)
- RIP-7212 precompile at 0x100

---

## Testing Notes

- **Local (Anvil):** Uses Solidity fallback (~450k gas)
- **Mainnet fork:** `anvil --fork-url https://eth.llamarpc.com` to test with real precompile
- **Mainnet:** Precompile available post-Pectra upgrade (~50-80k gas)

