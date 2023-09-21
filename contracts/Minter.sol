// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

interface IToken is IERC20 {
    function mint(address _account, uint256 _amount) external;

    function burn(address _account, uint256 _amount) external;
}

contract Minter is AccessControlUpgradeable {
    IToken public token;
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    mapping(address => bool) internal whitelistedAddresses;

    event Whitelisted(address account);
    event UnWhitelisted(address account);
    event Minted(address account, uint amount);
    event Burned(address account, uint amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _admin, IToken _token) public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(USER_ROLE, _admin);
        token = _token;
    }

    /**
     * @dev Checks if account is whitelisted.
     * @param _account The address to check.
     */
    function isWhitelisted(address _account) public view returns (bool) {
        return _isWhitelisted(_account);
    }

    /**
     * @dev Checks if account is whitelisted.
     * @param _account The address to check.
     */
    function _isWhitelisted(address _account) internal view returns (bool) {
        return whitelistedAddresses[_account];
    }

    /**
     * @dev Throws if the account is not whitelisted.
     * @param _account The address to check.
     */
    function _requireWhitelisted(address _account) internal view {
        require(_isWhitelisted(_account), "Address not whitelisted");
    }

    /**
     * @dev Throws if the account is not whitelisted.
     * @param _account The address to check.
     */
    modifier onlyWhitelisted(address _account) {
        _requireWhitelisted(_account);
        _;
    }

    /**
     * @dev Mints tokens to an account. Tokens can only be minted to whitelisted addresses.
     * @param _account The address to mint tokens to.
     * @param _amount The amount of tokens to mint.
     */
    function mint(address _account, uint256 _amount) public onlyRole(USER_ROLE) onlyWhitelisted(_account) {
        token.mint(_account, _amount);
        emit Minted(_account, _amount);
    }

    /**
     * @dev Burns tokens from an account. Tokens can only be burned from whitelisted addresses.
     * @param _account The address to burn tokens from.
     * @param _amount The amount of tokens to burn.
     */
    function burn(address _account, uint256 _amount) public onlyRole(USER_ROLE) onlyWhitelisted(_account) {
        token.burn(_account, _amount);
        emit Burned(_account, _amount);
    }

    /**
     * @dev Adds an address to the whitelist.
     * @param _account The address to add to the whitelist.
     */
    function whitelist(address _account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistedAddresses[_account] = true;
        emit Whitelisted(_account);
    }

    /**
     * @dev Removes an address from the whitelist.
     * @param _account The address to remove from the whitelist.
     */
    function unWhitelist(address _account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        delete whitelistedAddresses[_account];
        emit UnWhitelisted(_account);
    }
}
