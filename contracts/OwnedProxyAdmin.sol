// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract OwnedProxyAdmin is ProxyAdmin {
    constructor(address _owner) {
        transferOwnership(_owner);
    }
}
