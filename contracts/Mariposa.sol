// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@rari-capital/solmate/src/auth/Auth.sol";

/// @title MARIPOSA
/// @author RealKinando (MarcelFromDaCartel)

interface IBTRFLY{
    function mint(address account_, uint256 amount_) external;
}

/**
    @notice 
    This contract replaces both the Olympus V1 Treasury & Staking Distributor contracts.

    "RFV" is no longer intrinsically tied to the minting of BTRFLY, thus we've able to greatly
    simplify the process of minting BTRFLY, and store assets directly in our Gnosis Safe.

    This means that we've been able to replace the Treasury with a contract that can mint BTRFLY
    without doing checks to verify sufficient reserves. Thus, we're able to merge this functionality
    with the Staking distributor.

    However, as we are no longer proceeding with a rebase model, and a proceeding with fixed emissions
    - our new contract will distribute fixed numbers of tokens, instead of a proportion of current supply.
    Given our V2 tokenomics, the internal policy needs to be able to set budgets on a per use case basis,
    thus addresses are grouped into "departments" which all receive a collective balance, which can be 
    minted against by any address in that given department.

    Apart from this functionality, our Mariposa (Butterfly in Spanish) contract follows
    most of the conventions from the Olympus V1 staking distributor, plus minor optimisations.

*/

/// @notice for devs forking : DON'T DELETE RANDOM COMMENTS, DON'T FADE MANDEM/CARTEL LIKE THAT

/**



 */

contract Mariposa is Auth{

    event DepartmentTransfer(uint indexed from, uint indexed to, uint indexed amount);

    event DepartmentAdded(uint indexed id);

    event DepartmentAdjustmentSet(bool addAdjustment, uint indexed id, uint adjustmentRate, uint adjustmentTarget);

    event AddressDepartmentSet(uint indexed department, address recipient);

    /// @notice combines the info and adjustment structs of the staking distributor
    struct Department{
        bool addAdjustment;
        uint mintRate;
        uint adjustmentRate;
        uint adjustmentTarget;
    }

    address public btrfly;

    uint public immutable cap;
    uint public departmentCount;
    uint public epochSeconds;
    uint public lastEpoch;

    mapping(address => uint) public getAddressDepartment;
    mapping(uint => Department) public getDepartment;
    mapping(uint => uint) public getDepartmentBalance;

    /// @param owner_ : address that owns Mariposa (DAOsig)
    /// @param authority_ : address that determines which addresses can access requiresAuth functions
    /// @param btrfly_ : address of the btrfly token
    /// @param cap_ : (in wei units) cap for btrfly token
    /// @param epochSeconds_ : duration of an epoch, in seconds
    constructor(
        address owner_,
        address authority_,
        address btrfly_,
        uint cap_,
        uint epochSeconds_
    )
    Auth(owner_,Authority(authority_)){
        btrfly = btrfly_;
        require( cap_ > ERC20(btrfly).totalSupply(), "Mariposa : cap is lower than existing supply");
        cap = cap_;
        epochSeconds = epochSeconds_;
    }
    
    /**
        @notice fork of Olympus V1 Staking Distributor Fork method, with some differences :
        - increases budgets instead of minting tokens directly
        - increases budgets by fixed amounts instead of based on % of supply
        - triggers adjustments even if mintRate is zero for department
    */
    /// @dev adjustments occur here instead of in a seperate adjust() method
    function distribute() public{
        uint currentEpoch = block.timestamp / epochSeconds;
        require (currentEpoch > lastEpoch, "Mariposa : distribution event already occurred this epoch");
        uint totalSupplyOutstanding = currentOutstanding() + ERC20(btrfly).totalSupply();
        for (uint i = 0; i < currentEpoch - lastEpoch; i++){
            for (uint j = 1; j < departmentCount + 1 ; j++){
                if (getDepartment[j].mintRate > 0){
                    getDepartmentBalance[j] += getDepartment[j].mintRate;
                    totalSupplyOutstanding += getDepartment[j].mintRate;
                    require(totalSupplyOutstanding < cap, "Mariposa : Cap exceeded");
                    emit DepartmentTransfer(0, j, getDepartment[j].mintRate);
                }
                if (getDepartment[j].adjustmentRate > 0){
                    if(getDepartment[j].addAdjustment){
                        getDepartment[j].mintRate += getDepartment[j].adjustmentRate;
                        if ( getDepartment[j].mintRate >= getDepartment[j].adjustmentTarget ) {
                            getDepartment[j].adjustmentRate = 0;
                        }
                    }
                    else{
                        getDepartment[j].mintRate -= getDepartment[j].adjustmentRate;
                        if ( getDepartment[j].mintRate <= getDepartment[j].adjustmentTarget ) {
                            getDepartment[j].adjustmentRate = 0;
                        }
                    }
                }
            }
        }
    }

    // deddaf gnitteg acraB ni syob ehT //
    /// @return emissions : amount of tokens to added to department budgets next epoch
    function currentEmissions() public view returns (uint emissions){
        for( uint i = 1; i <= departmentCount; i++){
            emissions += getDepartment[i].mintRate;
        }
    }

    /// @return outstanding : amount of tokens currently available to mint, across all departments
    function currentOutstanding() public view returns (uint outstanding){
        for( uint i = 1; i <= departmentCount; i++){
            outstanding += getDepartmentBalance[i];
        }
    }

    /// @notice adds a department for serving emissions to
    /// @param addAdjustment_ : if an adjustment is provided, is it to increase emissions
    /// @param mintRate_ : starting amount of emissions to give per epoch
    /// @param adjustmentRate_ : rate of adjustment (zero if no adjustment)
    /// @param adjustmentTarget_ : target for adjustment (only applies if adjustmentRate_ > 0)
    function addDepartment(
            bool addAdjustment_,
            uint mintRate_,
            uint adjustmentRate_,
            uint adjustmentTarget_
        ) external requiresAuth{
            departmentCount++;

            getDepartment[departmentCount] = Department(
                addAdjustment_,
                mintRate_,
                adjustmentRate_,
                adjustmentTarget_
            );

            emit DepartmentAdded(departmentCount);
    }

    /// @param addAdjustment_ : whether the adjustment will increase emissions
    /// @param departmentId : id of the department to execute the adjustment
    /// @param adjustmentRate_ : rate of adjustment
    /// @param adjustmentTarget_ : target mintRate
    function setDepartmentAdjustment(
            bool addAdjustment_, 
            uint departmentId, 
            uint adjustmentRate_, 
            uint adjustmentTarget_
        ) external requiresAuth{
            Department storage department = getDepartment[departmentId];
            department.addAdjustment = addAdjustment_;
            department.adjustmentRate = adjustmentRate_;
            department.adjustmentTarget = adjustmentTarget_;
            emit DepartmentAdjustmentSet(addAdjustment_, departmentId, adjustmentRate_, adjustmentTarget_);
    }

    /// @param departmentId_ : id of the department to add the address to
    /// @param recipient_ : address that will added to the department
    function setAddressDepartment(uint departmentId_, address recipient_) external requiresAuth{
        require(departmentId_ <= departmentCount, "Mariposa : Department doesn't exist");
        getAddressDepartment[recipient_] = departmentId_;
        emit AddressDepartmentSet(departmentId_,recipient_);
    }

    /// @param amount : amount that msg.sender wishes to collect
    /// @dev uses assumption that department 0 is not set
    function request(uint amount) external{
        uint callerDepartment = getAddressDepartment[msg.sender];
        require(callerDepartment != 0, "Mariposa : msg.sender does not have permission to mint BTRFLY");

        // calls distribute if department lacks budget, in hopes of filling budget
        if (getDepartmentBalance[callerDepartment] < amount) distribute();
        
        getDepartmentBalance[callerDepartment] -= amount;
        IBTRFLY(btrfly).mint(msg.sender,amount);
        emit DepartmentTransfer(callerDepartment, 0, amount);
    }

}