// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "hardhat/console.sol";

import "./Mariposa.sol";
import "../olympusUtils/FullMath.sol";
import "../olympusUtils/FixedPoint.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
//import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract xBond is Ownable{

    using FixedPoint for *;
    using SafeERC20 for IERC20;

    event BondCreated( uint deposit, uint indexed payout, uint indexed expires, uint indexed nativePrice );
    event BondRedeemed( address indexed recipient, uint payout, uint remaining );
    event BondPriceChanged( uint indexed nativePrice, uint indexed internalPrice, uint indexed debtRatio );
    event ControlVariableAdjustment( uint initialBCV, uint newBCV, uint adjustment, bool addition );

    address public immutable BTRFLY; // token given as payment for bond
    address public immutable principal; // token used to create bond
    address public immutable mariposa; // mints BTRFLY
    address public immutable DAO; // receives principal tokens

    Terms public terms; // stores terms for new bonds
    Adjust public adjustment; // stores adjustment to BCV data

    mapping( address => Bond ) public bondInfo; // stores bond information for depositors

    uint public totalDebt; // total value of outstanding bonds; used for pricing
    uint public lastDecay; // reference block for debt decay
    uint public immutable floor; // replicates nativeFloorPrice[_token] from V1 Treasury
    uint8 public immutable pfDenominatorExp; // allows us to change payoutFor denominator for different decimal tokens
    uint8 public immutable bpDenominatorExp; // allows us to change bondPrice denominator for different decimal tokens

    /* ======== STRUCTS ======== */

    // Info for creating new bonds
    struct Terms {
        uint controlVariable; // scaling variable for price
        uint vestingTerm; // in blocks
        uint minimumPrice; // vs principal value
        uint maxPayout; // in thousandths of a %. i.e. 500 = 0.5%
        uint fee; // as % of bond payout, in hundreths. ( 500 = 5% = 0.05 for every 1 paid)
        uint tithe; // in thousandths of a %. i.e. 500 = 0.5%
        uint maxDebt; // 9 decimal debt ratio, max % total supply created as debt
    }

    // Info for bond holder
    struct Bond {
        uint payout; // BTRFLY remaining to be paid
        uint vesting; // Blocks left to vest
        uint lastBlock; // Last interaction
        uint pricePaid; // In native asset, for front end viewing
    }

    // Info for incremental adjustments to control variable 
    struct Adjust {
        bool add; // addition or subtraction
        uint rate; // increment
        uint target; // BCV when adjustment finished
        uint buffer; // minimum length (in blocks) between adjustments
        uint lastBlock; // block when last adjustment made
    }

    constructor ( 
        address BTRFLY_,
        address principal_,
        address mariposa_, 
        address DAO_, 
        uint floor_,
        uint8 pfDenominatorExp_,
        uint8 bpDenominatorExp_
    ) {
        require( BTRFLY_ != address(0) );
        BTRFLY = BTRFLY_;
        require( principal_ != address(0) );
        principal = principal_;
        require( mariposa_ != address(0) );
        mariposa = mariposa_;
        require( DAO_ != address(0) );
        DAO = DAO_;
        floor = floor_;
        require(pfDenominatorExp_ - bpDenominatorExp_ == 9, "xBond : incorrect denominator values");
        pfDenominatorExp = pfDenominatorExp_;
        bpDenominatorExp = bpDenominatorExp_;
    }

    /**
     *  @notice initializes bond parameters
     *  @param _controlVariable uint
     *  @param _vestingTerm uint
     *  @param _minimumPrice uint
     *  @param _maxPayout uint
     *  @param _fee uint
     *  @param _maxDebt uint
     *  @param _initialDebt uint
     */
    function initializeBondTerms( 
        uint _controlVariable, 
        uint _vestingTerm,
        uint _minimumPrice,
        uint _maxPayout,
        uint _fee,
        uint _maxDebt,
        uint _tithe,
        uint _initialDebt
    ) external onlyOwner() {
        require( terms.controlVariable == 0, "Bonds must be initialized from 0" );
        terms = Terms ({
            controlVariable: _controlVariable,
            vestingTerm: _vestingTerm,
            minimumPrice: _minimumPrice,
            maxPayout: _maxPayout,
            fee: _fee,
            maxDebt: _maxDebt,
            tithe: _tithe
        });
        totalDebt = _initialDebt;
        lastDecay = block.number;
    }

    /* ======== POLICY FUNCTIONS ======== */

    enum PARAMETER { VESTING, PAYOUT, FEE, DEBT }
    /**
     *  @notice set parameters for new bonds
     *  @param _parameter PARAMETER
     *  @param _input uint
     */
    function setBondTerms ( PARAMETER _parameter, uint _input ) external onlyOwner() {
        if ( _parameter == PARAMETER.VESTING ) { // 0
            require( _input >= 10000, "Vesting must be longer than 36 hours" );
            terms.vestingTerm = _input;
        } else if ( _parameter == PARAMETER.PAYOUT ) { // 1
            require( _input <= 1000, "Payout cannot be above 1 percent" );
            terms.maxPayout = _input;
        } else if ( _parameter == PARAMETER.FEE ) { // 2
            require( _input <= 10000, "DAO fee cannot exceed payout" );
            terms.fee = _input;
        } else if ( _parameter == PARAMETER.DEBT ) { // 3
            terms.maxDebt = _input;
        }
    }

    /**
     *  @notice set control variable adjustment
     *  @param _addition bool
     *  @param _increment uint
     *  @param _target uint
     *  @param _buffer uint
     */
    function setAdjustment ( 
        bool _addition,
        uint _increment, 
        uint _target,
        uint _buffer 
    ) external onlyOwner() {
        require( _increment <= terms.controlVariable*25/1000 , "Increment too large" );

        adjustment = Adjust({
            add: _addition,
            rate: _increment,
            target: _target,
            buffer: _buffer,
            lastBlock: block.number
        });
    }

        /* ======== USER FUNCTIONS ======== */

    /**
     *  @notice deposit bond
     *  @param _amount uint
     *  @param _maxPrice uint
     *  @param _depositor address
     *  @return uint
     */
    function deposit( 
        uint _amount, 
        uint _maxPrice,
        address _depositor
    ) external returns ( uint ) {
        require( _depositor != address(0), "Invalid address" );
        //require( _depositor == msg.sender , "Depositor not msg.sender" );

        redeem(_depositor);

        decayDebt();
        require( totalDebt <= terms.maxDebt, "Max capacity reached" );
        
        uint nativePrice = _bondPrice();

        require( _maxPrice >= nativePrice, "Slippage limit: more than max price" ); // slippage protection

        uint value = valueOf( _amount );
        console.log("value = ", value);
        uint payout = payoutFor( value ); // payout to bonder is computed
        console.log("payout = ", payout);

        require( payout >= 10000000, "Bond too small" ); // must be > 0.01 BTRFLY ( underflow protection )
        require( payout <= maxPayout(), "Bond too large"); // size protection because there is no slippage

        /**
            principal is transferred in
            approved and
            deposited into the treasury, returning (_amount - profit) BTRFLY
         */
        IERC20( principal ).safeTransferFrom( msg.sender, DAO, _amount );

        //call mintRewards

        Mariposa(mariposa).request(payout);
        
        // total debt is increased
        totalDebt += value; 
                
        // depositor info is stored
        bondInfo[ _depositor ] = Bond({ 
            payout: bondInfo[ _depositor ].payout + payout,
            vesting: terms.vestingTerm,
            lastBlock: block.number,
            pricePaid: nativePrice
        });

        // indexed events are emitted
        emit BondCreated( _amount, payout, block.number + terms.vestingTerm, nativePrice );
        //emit BondPriceChanged( bondPriceInUSD(), _bondPrice(), debtRatio() );

        adjust(); // control variable is adjusted
        return payout; 
    }

    function redeem( address _recipient) public returns ( uint ) {        
        Bond memory info = bondInfo[ _recipient ];
        uint percentVested = percentVestedFor( _recipient ); // (blocks since last interaction / vesting term remaining)

        if ( percentVested >= 10000 ) { // if fully vested
            delete bondInfo[ _recipient ]; // delete user info
            emit BondRedeemed( _recipient, info.payout, 0 ); // emit bond data
            IERC20( BTRFLY ).transfer( _recipient, info.payout ); // send payout
            return info.payout;
        } else { // if unfinished
            // calculate payout vested
            uint payout = info.payout * percentVested / 1000;

            // store updated deposit info
            bondInfo[ _recipient ] = Bond({
                payout: info.payout - payout,
                vesting: info.vesting - ( block.number - info.lastBlock ),
                lastBlock: block.number,
                pricePaid: info.pricePaid
            });

            emit BondRedeemed( _recipient, payout, bondInfo[ _recipient ].payout );
            IERC20( BTRFLY ).transfer( _recipient, payout ); // send payout
            return info.payout;
        }
    }

/**
     *  @notice makes incremental adjustment to control variable
     */
    function adjust() internal {
        uint blockCanAdjust = adjustment.lastBlock + adjustment.buffer;
        if( adjustment.rate != 0 && block.number >= blockCanAdjust ) {
            uint initial = terms.controlVariable;
            if ( adjustment.add ) {
                terms.controlVariable = terms.controlVariable + adjustment.rate;
                if ( terms.controlVariable >= adjustment.target ) {
                    adjustment.rate = 0;
                }
            } else {
                terms.controlVariable = terms.controlVariable - adjustment.rate;
                if ( terms.controlVariable <= adjustment.target ) {
                    adjustment.rate = 0;
                }
            }
            adjustment.lastBlock = block.number;
            emit ControlVariableAdjustment( initial, terms.controlVariable, adjustment.rate, adjustment.add );
        }
    }

    /**
     *  @notice reduce total debt
     */
    function decayDebt() internal {
        totalDebt = totalDebt - debtDecay();
        lastDecay = block.number;
    }




    /* ======== VIEW FUNCTIONS ======== */

    /**
        @notice returns BTRFLY valuation of asset
        @param _amount uint
        @return value_ uint
        @dev ERC20 used instead of IERC20 as IERC20 interface lacks decimals() method
     */
    function valueOf( uint _amount ) public view returns ( uint value_ ) {
        value_ = ( ( _amount * (10 ** 9 ) ) / 10 ** ERC20( principal ).decimals() ) * (10 ** 9) / floor;
    }

    /**
     *  @notice determine maximum bond size
     *  @return uint
     */
    function maxPayout() public view returns ( uint ) {
        return IERC20( BTRFLY ).totalSupply() * terms.maxPayout / 100000;
    }

    /**
     *  @notice calculate interest due for new bond
     *  @param _value uint
     *  @return uint
     */
    function payoutFor( uint _value ) public view returns ( uint ) {
        return FixedPoint.fraction( _value, bondPrice() ).decode112with18() / ( 10 ** pfDenominatorExp );
    }


    /**
     *  @notice calculate current bond premium
     *  @return price_ uint
     */
    function bondPrice() public view returns ( uint price_ ) {
        price_ = (( terms.controlVariable * debtRatio()) + floor ) / ( 10 ** bpDenominatorExp );
        if ( price_ < terms.minimumPrice ) {
            price_ = terms.minimumPrice;
        }
    }

    /**
     *  @notice calculate current bond price and remove floor if above
     *  @return price_ uint
     */
    function _bondPrice() internal returns ( uint price_ ) {
        price_ = (( terms.controlVariable * debtRatio()) + floor ) / ( 10 ** bpDenominatorExp );
        if ( price_ < terms.minimumPrice ) {
            price_ = terms.minimumPrice;        
        } else if ( terms.minimumPrice != 0 ) {
            terms.minimumPrice = 0;
        }
    }

    /**
     *  @notice calculate current ratio of debt to BTRFLY supply
     *  @return debtRatio_ uint
     */
    function debtRatio() public view returns ( uint debtRatio_ ) {   
        uint supply = IERC20( BTRFLY ).totalSupply();
        debtRatio_ = FixedPoint.fraction( 
            currentDebt() * 1e9, 
            supply
        ).decode112with18() / 1e18;
    }

    /**
     *  @notice calculate debt factoring in decay
     *  @return uint
     */
    function currentDebt() public view returns ( uint ) {
        return totalDebt - debtDecay();
    }

    /**
     *  @notice amount to decay total debt by
     *  @return decay_ uint
     */
    function debtDecay() public view returns ( uint decay_ ) {
        uint blocksSinceLast = block.number - lastDecay;
        decay_ = totalDebt * blocksSinceLast / terms.vestingTerm ;
        if ( decay_ > totalDebt ) {
            decay_ = totalDebt;
        }
    }


    /**
     *  @notice calculate how far into vesting a depositor is
     *  @param _depositor address
     *  @return percentVested_ uint
     */
    function percentVestedFor( address _depositor ) public view returns ( uint percentVested_ ) {
        Bond memory bond = bondInfo[ _depositor ];
        uint blocksSinceLast = block.number - bond.lastBlock;
        uint vesting = bond.vesting;

        if ( vesting > 0 ) {
            percentVested_ = blocksSinceLast * 10000 / vesting;
        } else {
            percentVested_ = 0;
        }
    }

    /**
     *  @notice calculate amount of BTRFLY available for claim by depositor
     *  @param _depositor address
     *  @return pendingPayout_ uint
     */
    function pendingPayoutFor( address _depositor ) external view returns ( uint pendingPayout_ ) {
        uint percentVested = percentVestedFor( _depositor );
        uint payout = bondInfo[ _depositor ].payout;

        if ( percentVested >= 10000 ) {
            pendingPayout_ = payout;
        } else {
            pendingPayout_ = payout * percentVested / 10000;
        }
    }


}