// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MARIPOSA
/// @author RealKinando (MarcelFromDaCartel), BabyYodaBaby

interface IBTRFLY {
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

contract Mariposa is Ownable {
    event DepartmentTransfer(
        uint256 indexed from,
        uint256 indexed to,
        uint256 indexed amount
    );

    event DepartmentAdded(uint256 indexed id);

    event DepartmentAdjustmentSet(uint256 mintRate);

    event AddressDepartmentSet(uint256 indexed department, address recipient);

    /// @notice combines the info and adjustment structs of the staking distributor
    struct Department {
        uint256 mintRate;
        uint256 lastDistributionEpoch;
    }

    address public btrfly;

    uint256 public immutable cap;
    uint8 public departmentCount;
    uint16 public epochSeconds;
    uint256 public previousEpoch;

    mapping(address => uint8) public getAddressDepartment;
    mapping(uint8 => Department) public getDepartment;
    mapping(uint8 => uint256) public getDepartmentBalance;

    /// @param btrfly_ : address of the btrfly token
    /// @param cap_ : (in wei units) cap for btrfly token
    /// @param epochSeconds_ : duration of an epoch, in seconds
    constructor(
        address btrfly_,
        uint256 cap_,
        uint16 epochSeconds_
    ) {
        btrfly = btrfly_;
        require(
            cap_ > IERC20(btrfly).totalSupply(),
            "Mariposa : cap lower than existing supply"
        );
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
    function distribute(uint8 departmentId) public {
        uint256 currentEpoch = block.timestamp / epochSeconds;
        uint256 lastEpoch = getDepartment[departmentId].lastDistributionEpoch;
        uint256 mintRate = getDepartment[departmentId].mintRate;
        require(
            currentEpoch > lastEpoch,
            "Mariposa : distribution event already occurred this epoch"
        );
        uint256 totalSupplyOutstanding = currentOutstanding() +
            IERC20(btrfly).totalSupply();

        if (mintRate > 0) {
            getDepartmentBalance[departmentId] +=
                mintRate *
                (currentEpoch - lastEpoch);

            totalSupplyOutstanding += mintRate * (currentEpoch - lastEpoch);
            require(totalSupplyOutstanding < cap, "Mariposa : Cap exceeded");

            emit DepartmentTransfer(
                0,
                departmentId,
                mintRate * (currentEpoch - lastEpoch)
            );
        }
        getDepartment[departmentId].lastDistributionEpoch = currentEpoch;
    }
    /**
        @notice Calls distribute on the department before updating the mint rate
        @param departmentId : the id for the department
        @param mintRate_ : amount of emissions to give per epoch
     */
    function setMintRate(uint8 departmentId, uint256 mintRate_)
        public
        onlyOwner
    {
        distribute(departmentId);

        Department storage department = getDepartment[departmentId];
        department.mintRate = mintRate_;

        emit DepartmentAdjustmentSet(mintRate_);
    }

    // deddaf gnitteg acraB ni syob ehT //
    /// @return emissions : amount of tokens to added to department budgets next epoch
    function currentEmissions() public view returns (uint256 emissions) {
        for (uint8 i = 1; i <= departmentCount; i++) {
            emissions += getDepartment[i].mintRate;
        }
    }

    /// @return outstanding : amount of tokens currently available to mint, across all departments
    function currentOutstanding() public view returns (uint256 outstanding) {
        for (uint8 i = 1; i <= departmentCount; i++) {
            outstanding += getDepartmentBalance[i];
        }
    }

    /// @notice adds a department for serving emissions to
    /// @param mintRate_ : starting amount of emissions to give per epoch
    function addDepartment(uint256 mintRate_) external onlyOwner {
        departmentCount++;

        if (departmentCount > 1) {
            getDepartment[departmentCount] = Department(
                mintRate_,
                getDepartment[departmentCount].lastDistributionEpoch
            );
        } else {
            getDepartment[departmentCount] = Department(mintRate_, 0);
        }

        emit DepartmentAdded(departmentCount);
    }

    /// @param mintRate_ : emissions to give per epoch
    /// @param departmentId_ : the id for the department
    function setDepartmentAdjustment(uint256 mintRate_, uint8 departmentId_)
        external
        onlyOwner
    {
        require(
            departmentId_ != 0,
            "Mariposa : msg.sender does not have permission to update mint rate"
        );
        Department storage department = getDepartment[departmentId_];
        department.mintRate = mintRate_;

        emit DepartmentAdjustmentSet(mintRate_);
    }

    /**
        @param departmentId_ : id of the department to add the address to
        @param recipient_ : address that will added to the department
     */
    function setAddressDepartment(uint8 departmentId_, address recipient_)
        external
        onlyOwner
    {
        require(
            departmentId_ != 0,
            "Mariposa: we cannot set the address for the zero department"
        );
        require(
            departmentId_ <= departmentCount,
            "Mariposa : Department doesn't exist"
        );
        getAddressDepartment[recipient_] = departmentId_;
        emit AddressDepartmentSet(departmentId_, recipient_);
    }

    /**
        @param amount : amount that msg.sender wishes to collect
        @dev uses assumption that department 0 is not set
     */
    function request(uint256 amount) external {
        uint8 callerDepartment = getAddressDepartment[msg.sender];
        require(
            callerDepartment != 0,
            "Mariposa : msg.sender does not have permission to mint BTRFLY"
        );

        // calls distribute to update the balance of each department before minting
        if (getDepartmentBalance[callerDepartment] < amount) {
            distribute(callerDepartment);
        }
        getDepartmentBalance[callerDepartment] -= amount;
        IBTRFLY(btrfly).mint(msg.sender, amount);
        emit DepartmentTransfer(callerDepartment, 0, amount);
    }
}
