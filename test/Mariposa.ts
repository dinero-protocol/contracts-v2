/*

    Test setup :
    
    use hardhat mainnet forking to :
    - deploy mariposa with a cap of 5M
    - immitate dao multisig 0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e
    - call setVault(mariposaAddress) on the btrfly contract

    tests to ensure
    - distributions are correct
    - adjustments are correct
    - requests update department budgets correctly
    - ensure unauthorised accounts CANNOT mint

*/