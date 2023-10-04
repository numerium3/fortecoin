// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/utils/Context.sol";

contract StablecoinProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address _proxyAdmin,
        address _admin
    ) TransparentUpgradeableProxy(_logic, _proxyAdmin, abi.encodeWithSignature("initialize(address)", _admin)) {}
}
