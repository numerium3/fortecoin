// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Limiter.sol";
import "./Beneficiaries.sol";

using LimiterLibrary for Limiter;
using BeneficiariesLibrary for Beneficiaries;

interface IToken is IERC20 {
    function mint(uint256 _amount) external;

    function burn(uint256 _amount) external;
}

contract Wallet is AccessControlUpgradeable {
    // Define constants for various roles using the keccak256 hash of the role names.
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE"); // Role identifier for users.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE"); // Role identifier for minters.
    
    IToken public token; // Reference to the token contract.
    Limiter private limiter; // Limits the amount of transfers possible within a given timeframe.
    Beneficiaries private beneficiaries; // Keeps track of beneficiaries allowed by this contract.
    
    /**
     * @dev Emitted when a beneficiary with address `address`, 24-hour transfer limit `limit`
     * and cooldown period `period` (in seconds) is added to the list of beneficiaries.
     */
    event BeneficiaryAdded(address beneficiary, uint limit, uint cooldown);

    /**
     * @dev Emitted when the 24-hour transfer limit of beneficiary with address `address`
     * is changed to `limit`.
     */
    event BeneficiaryLimitChanged(address beneficiary, uint limit);

    /**
     * @dev Emitted when the 24-hour transfer limit of beneficiary with address `address`
     * is temporarilly decreased by `limitDecrease`.
     */
    event BeneficiaryLimitTemporarilyDecreased(address beneficiary, uint limitDecrease);

    /**
     * @dev Emitted when the 24-hour transfer limit of beneficiary with address `address`
     * is temporarilly increased by `limitIncrease`.
     */
    event BeneficiaryLimitTemporarilyIncreased(address beneficiary, uint limitIncrease);

    /**
     * @dev Emitted when the beneficiary with address `address` is removed from the list of beneficiaries.
     */
    event BeneficiaryRemoved(address beneficiary);

    /**
     * @dev Emitted when the 24-hour transfer limit is changed to `limit`.
     */
    event LimitChanged(uint limit);

    /**
     * @dev Emitted when the 24-hour transfer limit is temporarilly decreased by `limitDecrease`.
     */
    event LimitTemporarilyDecreased(uint limitDecrease);

    /**
     * @dev Emitted when the 24-hour transfer limit is temporarilly increased by `limitIncrease`.
     */
    event LimitTemporarilyIncreased(uint limitIncrease);

    /**
     * @dev Emitted when `amount` of tokens are transferred to `beneficiary`.
     */
    event Transferred(address beneficiary, uint amount);

    /**
     * @dev Emitted when `amount` of `token` are transferred to `to`.
     */
    event Transferred(IERC20 token, address to, uint amount);

    /**
     * @dev Emitted when an `amount` of tokens is minted.
     */
    event Minted(uint amount);

    /**
     * @dev Emitted when an `amount` of tokens is burned.
     */
    event Burned(uint amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract with an admin and the address of the token.
     * @param _admin Address of the admin to be granted roles.
     * @param _token Address of the token contract.
     */
    function initialize(address _admin, IToken _token) public initializer {
        __AccessControl_init(); // Initializes the AccessControl module.
        _grantRole(DEFAULT_ADMIN_ROLE, _admin); // Grants the admin the DEFAULT_ADMIN_ROLE.
        _grantRole(MINTER_ROLE, _admin); // Grants the admin the MINTER_ROLE.
        _grantRole(USER_ROLE, _admin); // Grants the admin the USER_ROLE.
        token = _token; // Sets the token reference.
        limiter.interval = 24 hours; // Sets the default interval for the limiter.
    }

    /**
     * @dev Adds a beneficiary with a default 24-hour transfer limit of 0 and a default cooldown period of 24 hours.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary to be added.
     */
    function addBeneficiary(address _beneficiary) public onlyRole(DEFAULT_ADMIN_ROLE) {
        addBeneficiary(_beneficiary, 0);
    }

    /**
     * @dev Adds a beneficiary with a specified 24-hour transfer limit and a default cooldown period of 24 hours.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary to be added.
     * @param _limit Limit value for the beneficiary.
     */
    function addBeneficiary(address _beneficiary, uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        addBeneficiary(_beneficiary, _limit, 24 hours);
    }

    /**
     * @dev Adds a beneficiary with a specified 24-hour transfer limit and specified cooldown period.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary to be added.
     * @param _limit Limit value for the beneficiary.
     * @param _cooldown Cooldown period for the beneficiary.
     */
    function addBeneficiary(address _beneficiary, uint _limit, uint _cooldown) public onlyRole(DEFAULT_ADMIN_ROLE) {
        beneficiaries.addBeneficiary(_beneficiary, 24 hours, _limit, _cooldown);
        emit BeneficiaryAdded(_beneficiary, _limit, _cooldown);
    }

    /**
     * @dev Returns the list of all beneficiaries.
     */
    function getBeneficiaries() public view returns (Beneficiary[] memory) {
        return beneficiaries.getBeneficiaries();
    }

    /**
     * @dev Returns the details of a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiary(address _beneficiary) public view returns (Beneficiary memory) {
        return beneficiaries.getBeneficiary(_beneficiary);
    }

    /**
     * @dev Returns the timestamp when a beneficiary gets enabled.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryEnabledAt(address _beneficiary) public view returns (uint) {
        return beneficiaries.getBeneficiary(_beneficiary).enabledAt;
    }

    /**
     * @dev Returns the current 24-hour transfer limit for a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryLimit(address _beneficiary) public view returns (uint) {
        return beneficiaries.getBeneficiary(_beneficiary).limit;
    }

    /**
     * @dev Returns the remaining 24-hour transfer limit for a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryRemainingLimit(address _beneficiary) public view returns (int) {
        return beneficiaries.getBeneficiary(_beneficiary).remainingLimit;
    }

    /**
     * @dev Returns the list of transfers to a specific beneficiary within the last 24 hours.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryTransfers(address _beneficiary) public view returns (Transfer[] memory) {
        return beneficiaries.getBeneficiary(_beneficiary).transfers;
    }

    /**
     * @dev Returns the current 24-hour transfer limit.
     */
    function getLimit() public view returns (uint) {
        return limiter.limit;
    }

    /**
     * @dev Returns the remaining 24-hour transfer limit.
     */
    function getRemainingLimit() public view returns (int) {
        return limiter.remainingLimit();
    }

    /**
     * @dev Returns the list of all transfers within the last 24 hours.
     */
    function getTransfers() public view returns (Transfer[] memory) {
        return limiter.transfers();
    }

    /**
     * @dev Sets the 24-hour transfer limit for a specific beneficiary.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary.
     * @param _limit The limit value to be set for the beneficiary.
     */
    function setBeneficiaryLimit(address _beneficiary, uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        beneficiaries.setBeneficiaryLimit(_beneficiary, _limit);
        emit BeneficiaryLimitChanged(_beneficiary, _limit);
    }

    /**
     * @dev Sets the 24-hour transfer limit.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _limit The limit value to be set.
     */
    function setLimit(uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.limit = _limit;
        emit LimitChanged(_limit);
    }

    /**
     * @dev Temporarily increases the 24-hour transfer limiter for a specific beneficiary.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary.
     * @param _limitIncrease Amount by which the limit should be increased.
     */
    function temporarilyIncreaseBeneficiaryLimit(
        address _beneficiary,
        uint _limitIncrease
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        beneficiaries.temporarilyIncreaseBeneficiaryLimit(_beneficiary, _limitIncrease);
        emit BeneficiaryLimitTemporarilyIncreased(_beneficiary, _limitIncrease);
    }

    /**
     * @dev Temporarily decreases the 24-hour transfer limiter for a specific beneficiary.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _beneficiary Address of the beneficiary.
     * @param _limitDecrease Amount by which the limit should be decreased.
     */
    function temporarilyDecreaseBeneficiaryLimit(
        address _beneficiary,
        uint _limitDecrease
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        beneficiaries.temporarilyDecreaseBeneficiaryLimit(_beneficiary, _limitDecrease);
        emit BeneficiaryLimitTemporarilyDecreased(_beneficiary, _limitDecrease);
    }

    /**
     * @dev Temporarily increases the 24-hour transfer limiter.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _limitIncrease Amount by which the limit should be increased.
     */
    function temporarilyIncreaseLimit(uint _limitIncrease) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.temporarilyIncreaseLimit(_limitIncrease);
        emit LimitTemporarilyIncreased(_limitIncrease);
    }

    /**
     * @dev Temporarily decreases the 24-hour transfer limiter.
     * Can only be called by an account with the DEFAULT_ADMIN_ROLE.
     * @param _limitDecrease Amount by which the limit should be decreased.
     */
    function temporarilyDecreaseLimit(uint _limitDecrease) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.temporarilyDecreaseLimit(_limitDecrease);
        emit LimitTemporarilyDecreased(_limitDecrease);
    }

    /**
     * @dev Transfers the token to a specified beneficiary, subject to 24 hours limits.
     * Can only be called by an account with the USER_ROLE.
     * @param _beneficiary Address of the beneficiary to receive the tokens.
     * @param _amount Amount of tokens to be transferred.
     */
    function transfer(address _beneficiary, uint _amount) public onlyRole(USER_ROLE) {
        limiter.addTransfer(_amount, "Limit exceeded");
        beneficiaries.addBeneficiaryTransfer(_beneficiary, _amount);
        token.transfer(_beneficiary, _amount);
        emit Transferred(_beneficiary, _amount);
    }

    /**
     * @dev Transfers a specified token to a specified address.
     * @param _token Token to be transferred.
     * @param _to Address to receive the tokens.
     * @param _amount Amount of tokens to be transferred.
     */
    function transfer(IERC20 _token, address _to, uint _amount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _token.transfer(_to, _amount);
        emit Transferred(_token, _to, _amount);
    }

    /**
     * @dev Mints tokens to the wallet. 
     * Can only be called by an account with the MINTER_ROLE.
     * @param _amount Amount of tokens to be minted.
     */
    function mint(uint _amount) public onlyRole(MINTER_ROLE) {
        token.mint(_amount);
        emit Minted(_amount);
    }

    /**
     * @dev Burns tokens from the wallet. 
     * Can only be called by an account with the MINTER_ROLE.
     * @param _amount Amount of tokens to be minted.
     */
    function burn(uint _amount) public onlyRole(MINTER_ROLE) {
        token.burn(_amount);
        emit Burned(_amount);
    }
}
