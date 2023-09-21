// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ERC20BlacklistableUpgradable is Initializable, ContextUpgradeable, ERC20Upgradeable {
    mapping(address => bool) internal blacklistedAddresses;

    function __ERC20Blacklistable_init() internal onlyInitializing {}

    function __ERC20Blacklistable_init_unchained() internal onlyInitializing {}

    /**
     * @dev Emitted when an `account` is blacklisted.
     */
    event Blacklisted(address account);

    /**
     * @dev Emitted when an `account` is removed from the blacklist.
     */
    event UnBlacklisted(address account);

    /**
     * @dev Throws if argument account is blacklisted
     * @param account The address to check
     */
    modifier notBlacklisted(address account) {
        require(!blacklistedAddresses[account], "Blacklistable: account is blacklisted");
        _;
    }

    /**
     * @dev Checks if account is blacklisted
     * @param account The address to check
     */
    function isBlacklisted(address account) public view returns (bool) {
        return blacklistedAddresses[account];
    }

    /**
     * @dev Adds account to blacklist
     * @param account The address to blacklist
     */
    function _blacklist(address account) internal virtual {
        blacklistedAddresses[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @dev Removes account from blacklist
     * @param account The address to remove from the blacklist
     */
    function _unBlacklist(address account) internal virtual {
        blacklistedAddresses[account] = false;
        emit UnBlacklisted(account);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}

contract Stablecoin is
    Initializable,
    ERC20Upgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ERC20PermitUpgradeable,
    ERC20BlacklistableUpgradable
{
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _admin) public initializer {
        string memory name = "AUD Forte Stablecoin";
        __ERC20_init(name, "AUD");
        __Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init(name);
        __ERC20Blacklistable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(BLACKLISTER_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
    }

    function decimals() public view virtual override returns (uint8) {
        return 2;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function blacklist(address account) public onlyRole(BLACKLISTER_ROLE) {
        _blacklist(account);
    }

    function unBlacklist(address account) public onlyRole(BLACKLISTER_ROLE) {
        _unBlacklist(account);
    }

    function mint(address _account, uint256 _amount) public onlyRole(MINTER_ROLE) {
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) public onlyRole(MINTER_ROLE) {
        _burn(_account, _amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused notBlacklisted(from) notBlacklisted(to) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
