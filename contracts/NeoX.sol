// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract NeoX {
    address public owner;
    IERC20 public usdt;
    
    address public feeReceiver1 = 0xC0350e800492Cf15D3De0f702b0bacA61F96edfC;
    address public feeReceiver2 = 0xF28594BaE9b919415964a8373FB1433a3d60e6A2;
    
    uint256 public constant JOIN_FEE = 10 * 1e18;
    uint256 public constant MIN_UPGRADE = 1 * 1e18;
    uint256 public constant DIRECT_INCOME_PCT = 5; // 5%
    uint256 public constant UPLINE_BONUS_PCT = 5;  // 5% per level (up to 10)
    uint256 public constant DOWNLINE_BONUS_PCT = 5; // 5% per level (up to 2)
    
    // Time periods
    uint256 public DAY_PERIOD = 1 minutes; // Will be 1 minutes for dev
    uint256 public constant BOOST_WINDOW = 5 minutes;
    
    struct User {
        bool isRegistered;
        address sponsor;
        uint256 idValue;
        uint256 totalDeposited;
        uint256 joinTimestamp;
        uint256 lastRoiTimestamp;
        uint256 totalRoiEarned;
        uint256 pendingIncome;
        uint256 directReferrals;
        uint256 businessValue;
        bool isBoosted2;
        bool isBoosted4;
        address[] referrals;
        // BDI fields
        uint256 bdiStartTime;
        uint256 lastBdiTimestamp;
        uint256 currentBdiTier;
        uint256 bdiEndTimestamp;
        uint256 totalBdiEarned;
        // Reward fields
        uint256 maxLegBusiness;      // Value of the strongest leg
        uint256 lastRewardTimestamp; // Matching reward settlement
        uint256 rewardEndTimestamp;
        uint256 totalRewardEarned;
        bool isRewardActive;
        uint256 totalDirectEarned;
        uint256 totalQualifiedDirects; // For BDI (No time limit)
        uint256 boosterQualifiedDirects; // For Booster (20 min limit)
        bool isQualified100; // Has reached 100 USDT anytime
        bool isQualifiedBooster; // Reached 100 USDT within sponsor's window
        uint256 totalCappedIncome; // ROI + Direct + Upline + Downline (Capped at 4x stake)
        uint256 boostedStake;      // Stake eligible for boosted ROI (%)
    }
    
    mapping(address => User) public users;
    mapping(address => bool) public specialUsers;
    mapping(address => mapping(address => uint256)) public legBusiness; // [user][referral] => business
    mapping(address => uint256[11]) public levelUnlockTimestamps; // [user][level] => timestamp
    address[] public allUsers;
    
    // BDI Tiers
    uint256 public constant BDI_DURATION = 10; // periods
    uint256[] public bdiRates = [0, 10 * 1e18, 50 * 1e18, 100 * 1e18, 200 * 1e18];
    uint256[] public bdiThresholds = [0, 1000 * 1e18, 5000 * 1e18, 10000 * 1e18, 25000 * 1e18];

    // Matching Reward
    uint256 public constant MATCHING_REWARD_AMOUNT = 10 * 1e18; // 10 USDT
    uint256 public constant MATCHING_REWARD_DURATION = 10;     // 10 periods
    uint256 public constant MATCHING_THRESHOLD = 1000 * 1e18;   // 1000 USDT
    
    event Joined(address indexed user, address indexed sponsor);
    event Upgraded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event IncomeReceived(address indexed user, address indexed from, uint256 amount, string typeOfIncome);
    event QualifiedDirectAdded(address indexed sponsor, address indexed referral);
    event BoosterActivated(address indexed user, uint256 level);
    event DebugBoost(address user, uint256 currentTimestamp, uint256 joinTimestamp, uint256 window);

    constructor(address _rootUser, address _usdt, address[] memory _specialUsers) {
        owner = msg.sender;
        usdt = IERC20(_usdt);
        
        // Root user initialization
        users[_rootUser].isRegistered = true;
        users[_rootUser].idValue = JOIN_FEE;
        users[_rootUser].totalDeposited = JOIN_FEE;
        users[_rootUser].joinTimestamp = block.timestamp;
        users[_rootUser].lastRoiTimestamp = block.timestamp;
        users[_rootUser].boostedStake = JOIN_FEE;
        allUsers.push(_rootUser);
        
        // Special Users mapping
        for(uint i=0; i<_specialUsers.length; i++) {
            address sUser = _specialUsers[i];
            specialUsers[sUser] = true;
            // Initialize special users' timestamps so they have a 5-min booster window from deployment
            users[sUser].isRegistered = true;
            users[sUser].joinTimestamp = block.timestamp;
            users[sUser].lastRoiTimestamp = block.timestamp;
            users[sUser].idValue = JOIN_FEE;
            users[sUser].boostedStake = JOIN_FEE;
            
            for(uint8 j=1; j<=10; j++) {
                levelUnlockTimestamps[sUser][j] = block.timestamp;
            }
        }
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function setDayPeriod(uint256 _seconds) external onlyOwner {
        DAY_PERIOD = _seconds;
    }

    function setFeeReceivers(address _receiver1, address _receiver2) external onlyOwner {
        feeReceiver1 = _receiver1;
        feeReceiver2 = _receiver2;
    }

    function join(address _sponsor) external {
        require(!users[msg.sender].isRegistered, "Already registered");
        require(users[_sponsor].isRegistered, "Invalid sponsor");
        
        usdt.transferFrom(msg.sender, address(this), JOIN_FEE);

        uint256 platformFee = (JOIN_FEE * 5) / 100;
        if (feeReceiver1 != address(0)) usdt.transfer(feeReceiver1, platformFee);
        if (feeReceiver2 != address(0)) usdt.transfer(feeReceiver2, platformFee);
        
        users[msg.sender].isRegistered = true;
        users[msg.sender].sponsor = _sponsor;
        users[msg.sender].idValue = JOIN_FEE;
        users[msg.sender].totalDeposited = JOIN_FEE;
        users[msg.sender].joinTimestamp = block.timestamp;
        users[msg.sender].lastRoiTimestamp = block.timestamp;
        users[msg.sender].boostedStake = JOIN_FEE;
        
        allUsers.push(msg.sender);
        users[_sponsor].directReferrals++;
        users[_sponsor].referrals.push(msg.sender);
        
        _updateBusinessValue(msg.sender, JOIN_FEE);
        _updateQualifiedStatus(msg.sender);
        // _updateQualifiedStatus calls checkBoostStatus for sponsor internally
        _settleBdi(_sponsor);

        // 5% Direct Income immediately to sponsor
        uint256 directIncome = (JOIN_FEE * DIRECT_INCOME_PCT) / 100;
        uint256 cappedDirect = _applyGlobalCap(_sponsor, directIncome);
        if (cappedDirect > 0) {
            usdt.transfer(_sponsor, cappedDirect);
            users[_sponsor].totalDirectEarned += cappedDirect;
            users[_sponsor].totalCappedIncome += cappedDirect;
            emit IncomeReceived(_sponsor, msg.sender, cappedDirect, "Direct Income");
        }
        
        emit Joined(msg.sender, _sponsor);
    }

    function upgrade(uint256 _amount) external {
        require(users[msg.sender].isRegistered, "Not registered");
        require(_amount >= MIN_UPGRADE, "Amount too low");
        
        // Safety: If joinTimestamp is 0 (broken state), start it now for a fresh 5-min window
        if (users[msg.sender].joinTimestamp == 0) {
            users[msg.sender].joinTimestamp = block.timestamp;
            users[msg.sender].boostedStake = users[msg.sender].idValue; 
        }
        
        // 1. Settle old ROI at current low stake BEFORE adding new stake
        _settleRoi(msg.sender);
        _settleBdi(msg.sender);
        
        usdt.transferFrom(msg.sender, address(this), _amount);
        
        uint256 platformFee = (_amount * 5) / 100;
        if (feeReceiver1 != address(0)) usdt.transfer(feeReceiver1, platformFee);
        if (feeReceiver2 != address(0)) usdt.transfer(feeReceiver2, platformFee);
        
        users[msg.sender].idValue += _amount;
        users[msg.sender].totalDeposited += _amount;
        
        emit DebugBoost(msg.sender, block.timestamp, users[msg.sender].joinTimestamp, BOOST_WINDOW);

        if (block.timestamp <= users[msg.sender].joinTimestamp + BOOST_WINDOW) {
            users[msg.sender].boostedStake += _amount;
        }
        
        // 2. NOW update qualification and booster status WITH the new stake
        _updateBusinessValue(msg.sender, _amount);
        _updateQualifiedStatus(msg.sender);
        checkBoostStatus(msg.sender);
        
        // 3. Settle AGAIN if booster was activated to ensure new rate applies from THIS block
        // (checkBoostStatus handles the second settlement internal to it)
        
        // 5% Direct Upgrade Income to sponsor
        address sponsor = users[msg.sender].sponsor;
        if (sponsor != address(0)) {
            uint256 upgradeIncome = (_amount * DIRECT_INCOME_PCT) / 100;
            uint256 cappedUpgrade = _applyGlobalCap(sponsor, upgradeIncome);
            if (cappedUpgrade > 0) {
                usdt.transfer(sponsor, cappedUpgrade);
                users[sponsor].totalDirectEarned += cappedUpgrade;
                users[sponsor].totalCappedIncome += cappedUpgrade;
                emit IncomeReceived(sponsor, msg.sender, cappedUpgrade, "Direct Upgrade Income");
            }
        }
        
        emit Upgraded(msg.sender, _amount);
    }

    function checkBoostStatus(address _user) public {
        User storage u = users[_user];
        if (u.idValue < 100 * 1e18) return;
        
        uint256 qualifiedCount = 0;
        for (uint256 i = 0; i < u.referrals.length; i++) {
            if (users[u.referrals[i]].isQualifiedBooster) {
                qualifiedCount++;
            }
        }

        if (qualifiedCount >= 4 && !u.isBoosted4) {
            u.isBoosted4 = true;
            u.isBoosted2 = false;
            _settleRoi(_user);
            _settleBdi(_user);
            emit BoosterActivated(_user, 4);
        } else if (qualifiedCount >= 2 && !u.isBoosted4 && !u.isBoosted2) {
            u.isBoosted2 = true;
            _settleRoi(_user);
            _settleBdi(_user);
            emit BoosterActivated(_user, 2);
        }
    }

    function _updateQualifiedStatus(address _user) internal {
        User storage u = users[_user];
        address sponsor = u.sponsor;
        
        if (u.idValue >= 100 * 1e18) {
            // 1. Permanent BDI Qualification
            if (!u.isQualified100) {
                u.isQualified100 = true;
                if (sponsor != address(0)) {
                    users[sponsor].totalQualifiedDirects++;
                    uint256 qCount = users[sponsor].totalQualifiedDirects;
                    if (qCount <= 10 && levelUnlockTimestamps[sponsor][qCount] == 0) {
                        levelUnlockTimestamps[sponsor][qCount] = block.timestamp;
                    }
                    emit QualifiedDirectAdded(sponsor, _user);
                    _settleBdi(sponsor); // Re-check BDI for sponsor
                }
            }
            
            // 2. Time-Limited Booster Qualification
            if (!u.isQualifiedBooster && sponsor != address(0)) {
                if (block.timestamp <= users[sponsor].joinTimestamp + BOOST_WINDOW) {
                    u.isQualifiedBooster = true;
                    users[sponsor].boosterQualifiedDirects++;
                    checkBoostStatus(sponsor); // Re-check booster for sponsor
                }
            }
        }
    }

    function getRoiRate(address _user) public view returns (uint256) {
        User memory u = users[_user];
        if (u.isBoosted4) return 4;
        if (u.isBoosted2) return 3;
        return 2;
    }

    function checkBdiTier(address _user) public view returns (uint256) {
        User storage u = users[_user];
        if (u.totalQualifiedDirects < 10 && !specialUsers[_user]) return 0;
        
        for (uint i = 4; i >= 1; i--) {
            if (u.businessValue >= bdiThresholds[i]) {
                return i;
            }
        }
        return 0;
    }

    function pendingBdiIncome(address _user) public view returns (uint256) {
        User storage u = users[_user];
        if (u.currentBdiTier == 0 || u.lastBdiTimestamp == 0) return 0;
        
        uint256 endTime = block.timestamp > u.bdiEndTimestamp ? u.bdiEndTimestamp : block.timestamp;
        if (endTime <= u.lastBdiTimestamp) return 0;
        
        uint256 timePassed = endTime - u.lastBdiTimestamp;
        uint256 periods = timePassed / DAY_PERIOD;
        if (periods == 0) return 0;
        
        return periods * bdiRates[u.currentBdiTier];
    }

    function pendingRoiIncome(address _user) public view returns (uint256 amount, uint256 periodsSpent) {
        User storage u = users[_user];
        if (!u.isRegistered || u.lastRoiTimestamp == 0) return (0, 0);
        
        uint256 timePassed = block.timestamp - u.lastRoiTimestamp;
        periodsSpent = timePassed / DAY_PERIOD;
        if (periodsSpent == 0) return (0, 0);
        
        uint256 rate = getRoiRate(_user);
        uint256 boostedRoi = (u.boostedStake * rate * periodsSpent) / 100;
        uint256 standardRoi = ((u.idValue - u.boostedStake) * 2 * periodsSpent) / 100;
        uint256 roiAmount = boostedRoi + standardRoi;
        
        // 1. Personal ROI Cap (2x)
        uint256 maxRoi = u.idValue * 2;
        if (u.totalRoiEarned + roiAmount > maxRoi) {
            roiAmount = maxRoi > u.totalRoiEarned ? maxRoi - u.totalRoiEarned : 0;
        }

        // 2. Global Income Cap (4x)
        uint256 maxGlobal = u.idValue * 4;
        if (u.totalCappedIncome + roiAmount > maxGlobal) {
            roiAmount = maxGlobal > u.totalCappedIncome ? maxGlobal - u.totalCappedIncome : 0;
        }

        return (roiAmount, periodsSpent);
    }

    function pendingRewardIncome(address _user) public view returns (uint256) {
        User storage u = users[_user];
        if (!u.isRewardActive || u.lastRewardTimestamp == 0) return 0;
        
        uint256 endTime = block.timestamp > u.rewardEndTimestamp ? u.rewardEndTimestamp : block.timestamp;
        if (endTime <= u.lastRewardTimestamp) return 0;
        
        uint256 timePassed = endTime - u.lastRewardTimestamp;
        uint256 periods = timePassed / DAY_PERIOD;
        if (periods == 0) return 0;
        
        return periods * MATCHING_REWARD_AMOUNT;
    }

    function _settleReward(address _user) internal {
        uint256 pending = pendingRewardIncome(_user);
        if (pending > 0) {
            User storage u = users[_user];
            u.totalRewardEarned += pending;
            u.pendingIncome += pending;
            u.lastRewardTimestamp += (pending / MATCHING_REWARD_AMOUNT) * DAY_PERIOD;
            emit IncomeReceived(_user, address(0), pending, "Team Matching Reward");
        }
        
        User storage u2 = users[_user];
        if (!u2.isRewardActive) {
            uint256 otherLegsBusiness = u2.businessValue - u2.maxLegBusiness;
            if (u2.maxLegBusiness >= MATCHING_THRESHOLD && otherLegsBusiness >= MATCHING_THRESHOLD) {
                u2.isRewardActive = true;
                u2.lastRewardTimestamp = block.timestamp;
                u2.rewardEndTimestamp = block.timestamp + (MATCHING_REWARD_DURATION * DAY_PERIOD);
            }
        }
    }

    function _settleBdi(address _user) internal {
        uint256 pending = pendingBdiIncome(_user);
        if (pending > 0) {
            User storage u = users[_user];
            u.totalBdiEarned += pending;
            u.pendingIncome += pending;
            uint256 periods = pending / bdiRates[u.currentBdiTier];
            u.lastBdiTimestamp += (periods * DAY_PERIOD);
            emit IncomeReceived(_user, address(0), pending, "Business Development Income");
        }
        
        uint256 newTier = checkBdiTier(_user);
        if (newTier > users[_user].currentBdiTier) {
            users[_user].currentBdiTier = newTier;
            users[_user].bdiEndTimestamp = block.timestamp + (BDI_DURATION * DAY_PERIOD);
            users[_user].lastBdiTimestamp = block.timestamp;
            if (users[_user].bdiStartTime == 0) users[_user].bdiStartTime = block.timestamp;
        }
    }

    function _settleRoi(address _user) internal {
        (uint256 pending, uint256 periods) = pendingRoiIncome(_user);
        if (periods > 0) {
            User storage u = users[_user];
            uint256 _startTime = u.lastRoiTimestamp;
            // Update timestamp regardless of whether income was earned (to prevent backlog)
            if (pending > 0) {
                u.totalRoiEarned += pending;
                u.totalCappedIncome += pending;
                u.pendingIncome += pending;
                _distributeUplineBonus(_user, pending, periods, _startTime);
                _distributeDownlineBonus(_user, pending, periods);
                emit IncomeReceived(_user, address(0), pending, "ROI Accumulation");
            }
            u.lastRoiTimestamp += (periods * DAY_PERIOD);
        }
    }

    function withdraw() external {
        _settleRoi(msg.sender);
        _settleBdi(msg.sender);
        _settleReward(msg.sender);
        
        User storage u = users[msg.sender];
        uint256 amount = u.pendingIncome;
        require(amount >= 10 * 1e18, "Min withdrawal 10 USDT");
        
        u.pendingIncome = 0;
        usdt.transfer(msg.sender, amount);
        
        emit Withdrawn(msg.sender, amount);
    }

    function _updateBusinessValue(address _user, uint256 _amount) internal {
        address previous = _user;
        address current = users[_user].sponsor;
        for (uint i = 0; i < 100; i++) {
            if (current == address(0)) break;
            
            // Track per-leg business
            legBusiness[current][previous] += _amount;
            if (legBusiness[current][previous] > users[current].maxLegBusiness) {
                users[current].maxLegBusiness = legBusiness[current][previous];
            }
            
            users[current].businessValue += _amount;
            _settleBdi(current);
            _settleReward(current);
            
            previous = current;
            current = users[current].sponsor;
        }
    }

    function _distributeUplineBonus(address _user, uint256 _roiAmount, uint256 _periods, uint256 _startTime) internal {
        if (_periods == 0) return;
        address current = users[_user].sponsor;
        uint256 perPeriodBonus = (_roiAmount * UPLINE_BONUS_PCT) / (100 * _periods);
        uint256 endTime = _startTime + (_periods * DAY_PERIOD);

        for (uint256 i = 1; i <= 10; i++) {
            if (current == address(0)) break;
            
            uint256 unlockTime = levelUnlockTimestamps[current][i];
            if (specialUsers[current]) unlockTime = users[current].joinTimestamp;

            if (unlockTime != 0 && unlockTime < endTime) {
                uint256 effectiveStart = unlockTime > _startTime ? unlockTime : _startTime;
                uint256 overlapTime = endTime - effectiveStart;
                uint256 overlapPeriods = overlapTime / DAY_PERIOD;
                
                if (overlapPeriods > _periods) overlapPeriods = _periods;

                if (overlapPeriods > 0) {
                    uint256 bonus = perPeriodBonus * overlapPeriods;
                    uint256 cappedBonus = _applyGlobalCap(current, bonus);
                    if (cappedBonus > 0) {
                        users[current].pendingIncome += cappedBonus;
                        users[current].totalCappedIncome += cappedBonus;
                        emit IncomeReceived(current, _user, cappedBonus, _getUplineLevelLabel(i));
                    }
                }
            }
            current = users[current].sponsor;
        }
    }

    function _getUplineLevelLabel(uint256 _level) internal pure returns (string memory) {
        if (_level == 1) return "Upline Bonus (L1)";
        if (_level == 2) return "Upline Bonus (L2)";
        if (_level == 3) return "Upline Bonus (L3)";
        if (_level == 4) return "Upline Bonus (L4)";
        if (_level == 5) return "Upline Bonus (L5)";
        if (_level == 6) return "Upline Bonus (L6)";
        if (_level == 7) return "Upline Bonus (L7)";
        if (_level == 8) return "Upline Bonus (L8)";
        if (_level == 9) return "Upline Bonus (L9)";
        if (_level == 10) return "Upline Bonus (L10)";
        return "Upline Bonus";
    }

    function _distributeDownlineBonus(address _user, uint256 _roiAmount, uint256 _periods) internal {
        uint256 levelPoolBonus = (_roiAmount * DOWNLINE_BONUS_PCT) / 100;
        
        // Level n+1
        address[] memory nPlus1 = users[_user].referrals;
        _distributeToLevel(nPlus1, levelPoolBonus, _user, _periods);
        
        // Level n+2 (collect all referrals of n+1)
        uint256 totalN2Count = 0;
        for(uint i=0; i<nPlus1.length; i++) {
            totalN2Count += users[nPlus1[i]].referrals.length;
        }
        
        if(totalN2Count > 0) {
            address[] memory nPlus2 = new address[](totalN2Count);
            uint256 k = 0;
            for(uint i=0; i<nPlus1.length; i++) {
                address[] memory refs = users[nPlus1[i]].referrals;
                for(uint j=0; j<refs.length; j++) {
                    nPlus2[k++] = refs[j];
                }
            }
            _distributeToLevel(nPlus2, levelPoolBonus, _user, _periods);
        }
    }

    function _distributeToLevel(address[] memory _levelMembers, uint256 _amount, address _from, uint256 _periods) internal {
        if (_periods == 0) return;
        
        uint256 eligibleCount = 0;
        for(uint i=0; i<_levelMembers.length; i++) {
            if (specialUsers[_levelMembers[i]] || users[_levelMembers[i]].idValue >= 250 * 1e18) {
                eligibleCount++;
            }
        }
        
        if (eligibleCount > 0) {
            uint256 perReferralTotalShare = _amount / eligibleCount;
            uint256 startTime = users[_from].lastRoiTimestamp;
            uint256 endTime = block.timestamp;

            for(uint i=0; i<_levelMembers.length; i++) {
                address member = _levelMembers[i];
                if (specialUsers[member] || users[member].idValue >= 250 * 1e18) {
                    uint256 memberJoin = users[member].joinTimestamp;
                    uint256 effectiveStart = memberJoin > startTime ? memberJoin : startTime;
                    
                    if (endTime > effectiveStart) {
                        uint256 overlapTime = endTime - effectiveStart;
                        uint256 overlapPeriods = overlapTime / DAY_PERIOD;
                        if (overlapPeriods > _periods) overlapPeriods = _periods;

                        if (overlapPeriods > 0) {
                            uint256 share = (perReferralTotalShare * overlapPeriods) / _periods;
                            uint256 cappedShare = _applyGlobalCap(member, share);
                            if (cappedShare > 0) {
                                users[member].pendingIncome += cappedShare;
                                users[member].totalCappedIncome += cappedShare;
                                emit IncomeReceived(member, _from, cappedShare, "Downline Bonus");
                            }
                        }
                    }
                }
            }
        }
    }

    function _applyGlobalCap(address _user, uint256 _amount) internal view returns (uint256) {
        User storage u = users[_user];
        uint256 maxGlobal = u.idValue * 4;
        if (u.totalCappedIncome >= maxGlobal) return 0;
        uint256 remaining = maxGlobal - u.totalCappedIncome;
        return _amount > remaining ? remaining : _amount;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = usdt.balanceOf(address(this));
        usdt.transfer(owner, balance);
    }

    function getReferrals(address _user) external view returns (address[] memory) {
        return users[_user].referrals;
    }
}
