//SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/**
 * A smart contract that allows changing a state variable using passkey signatures
 * Supports passkey (WebAuthn) signature verification using the secp256r1 precompile
 * @author BuidlGuidl
 */
contract YourContract {
    // State Variables
    string public greeting = "Building Unstoppable Apps!!!";
    address public greetingSetter;

    // Passkey storage
    mapping(bytes32 => bool) public registeredCredentials;
    mapping(bytes32 => bytes32) public credentialPubKeyX;
    mapping(bytes32 => bytes32) public credentialPubKeyY;

    // Events
    event PasskeyRegistered(bytes32 indexed credentialId, bytes32 qx, bytes32 qy);
    event GreetingChangeWithPasskey(bytes32 indexed credentialId, string newGreeting);

    /**
     * Derive an Ethereum-style address from a passkey's public key coordinates
     * @param qx - public key X coordinate
     * @param qy - public key Y coordinate
     */
    function getPasskeyAddress(bytes32 qx, bytes32 qy) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(qx, qy)))));
    }

    /**
     * Register a passkey's public key on-chain
     * @param credentialId - unique identifier for the credential (hashed rawId from WebAuthn)
     * @param qx - public key X coordinate
     * @param qy - public key Y coordinate
     */
    function registerPasskey(bytes32 credentialId, bytes32 qx, bytes32 qy) public {
        require(!registeredCredentials[credentialId], "Credential already registered");
        
        registeredCredentials[credentialId] = true;
        credentialPubKeyX[credentialId] = qx;
        credentialPubKeyY[credentialId] = qy;

        emit PasskeyRegistered(credentialId, qx, qy);
    }

    /**
     * Set greeting using a passkey signature verified via secp256r1 precompile
     * @param _newGreeting - new greeting to save on the contract
     * @param credentialId - the registered credential ID
     * @param auth - WebAuthn authentication assertion data
     */
    function setGreetingWithPasskey(
        string memory _newGreeting,
        bytes32 credentialId,
        WebAuthn.WebAuthnAuth memory auth
    ) public {
        require(registeredCredentials[credentialId], "Credential not registered");

        bytes32 qx = credentialPubKeyX[credentialId];
        bytes32 qy = credentialPubKeyY[credentialId];

        bytes memory challenge = abi.encodePacked(keccak256(abi.encodePacked(_newGreeting)));

        bool isValid = WebAuthn.verify(challenge, auth, qx, qy);
        require(isValid, "Invalid passkey signature");

        greeting = _newGreeting;
        greetingSetter = getPasskeyAddress(qx, qy);

        emit GreetingChangeWithPasskey(credentialId, _newGreeting);
    }
}
