// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Limiter.sol";
import "./Beneficiaries.sol";

using LimiterLibrary for Limiter;
using BeneficiariesLibrary for Beneficiaries;

contract Wallet is AccessControlUpgradeable {
    IERC20 public token; // Reference to the token contract.
    Limiter private limiter; // Limits the amount of transfers possible within a given timeframe.
    Beneficiaries private beneficiaries; // Keeps track of beneficiaries allowed by this contract.
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE"); // Role identifier for users.

    event BeneficiaryAdded(address beneficiary, uint limit, uint cooldown);
    event BeneficiaryLimitChanged(address beneficiary, uint limit);
    event BeneficiaryLimitTemporarilyDecreased(address beneficiary, uint limitIncrease);
    event BeneficiaryLimitTemporarilyIncreased(address beneficiary, uint limitIncrease);
    event BeneficiaryRemoved(address beneficiary);
    event LimitChanged(uint limit);
    event LimitTemporarilyDecreased(uint limitIncrease);
    event LimitTemporarilyIncreased(uint limitIncrease);
    event Transferred(address beneficiary, uint amount);
    event Transferred(IERC20 token, address to, uint amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract with an admin and the address of the token.
     * @param _admin Address of the admin to be granted roles.
     * @param _token Address of the Stablecoin contract.
     */
    function initialize(address _admin, IERC20 _token) public initializer {
        __AccessControl_init(); // Initializes the AccessControl module.
        _grantRole(DEFAULT_ADMIN_ROLE, _admin); // Grants the admin the DEFAULT_ADMIN_ROLE.
        _grantRole(USER_ROLE, _admin); // Grants the admin the USER_ROLE.
        token = _token; // Sets the token reference.
        limiter.interval = 24 hours; // Sets the default interval for the limiter.
    }

    /**
     * @dev Adds a beneficiary with default parameters.
     * @param _beneficiary Address of the beneficiary to be added.
     */
    function addBeneficiary(address _beneficiary) public onlyRole(DEFAULT_ADMIN_ROLE) {
        addBeneficiary(_beneficiary, 0);
    }

    /**
     * @dev Adds a beneficiary with a specified 24 hour transfer limit and a default cooldown period of 24 hours.
     * @param _beneficiary Address of the beneficiary to be added.
     * @param _limit Limit value for the beneficiary.
     */
    function addBeneficiary(address _beneficiary, uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        addBeneficiary(_beneficiary, _limit, 24 hours);
    }

    /**
     * @dev Adds a beneficiary with a specified 24 hour transfer limit and cooldown period.
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
     * @dev Returns the current 24 hour transfer limit for a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryLimit(address _beneficiary) public view returns (uint) {
        return beneficiaries.getBeneficiary(_beneficiary).limit;
    }

    /**
     * @dev Returns the remaining 24 hour transfer limit for a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryRemainingLimit(address _beneficiary) public view returns (int) {
        return beneficiaries.getBeneficiary(_beneficiary).remainingLimit;
    }

    /**
     * @dev Returns the list of transfers for a specific beneficiary within the last 24 hours.
     * @param _beneficiary Address of the beneficiary.
     */
    function getBeneficiaryTransfers(address _beneficiary) public view returns (Transfer[] memory) {
        return beneficiaries.getBeneficiary(_beneficiary).transfers;
    }

    /**
     * @dev Returns the current 24 hour transfer limit.
     */
    function getLimit() public view returns (uint) {
        return limiter.limit;
    }

    /**
     * @dev Returns the remaining 24 hour transfer limit.
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
     * @dev Sets the 24 hour transfer limit for a specific beneficiary.
     * @param _beneficiary Address of the beneficiary.
     * @param _limit The limit value to be set for the beneficiary.
     */
    function setBeneficiaryLimit(address _beneficiary, uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        beneficiaries.setBeneficiaryLimit(_beneficiary, _limit);
        emit BeneficiaryLimitChanged(_beneficiary, _limit);
    }

    /**
     * @dev Sets the 24 hour transfer limit.
     * @param _limit The limit value to be set.
     */
    function setLimit(uint _limit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.limit = _limit;
        emit LimitChanged(_limit);
    }

    /**
     * @dev Temporarily increases the 24 hour transfer limiter for a specific beneficiary.
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
     * @dev Temporarily decreases the 24 hour transfer limiter for a specific beneficiary.
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
     * @dev Temporarily increases the 24 hour transfer limiter.
     * @param _limitIncrease Amount by which the limit should be increased.
     */
    function temporarilyIncreaseLimit(uint _limitIncrease) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.temporarilyIncreaseLimit(_limitIncrease);
        emit LimitTemporarilyIncreased(_limitIncrease);
    }

    /**
     * @dev Temporarily decreases the 24 hour transfer limiter.
     * @param _limitDecrease Amount by which the limit should be decreased.
     */
    function temporarilyDecreaseLimit(uint _limitDecrease) public onlyRole(DEFAULT_ADMIN_ROLE) {
        limiter.temporarilyDecreaseLimit(_limitDecrease);
        emit LimitTemporarilyDecreased(_limitDecrease);
    }

    /**
     * @dev Transfers the token to a specified beneficiary, subject to 24 hours limits.
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
}
