export const NEOX_ADDRESS = '0x447d4a5190f6b228d35ae96a4e022e9b9764d0ad'

export const NEOX_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_rootUser", "type": "address" },
            { "internalType": "address", "name": "_usdt", "type": "address" },
            { "internalType": "address[]", "name": "_specialUsers", "type": "address[]" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "sponsor", "type": "address" }
        ],
        "name": "Joined",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Upgraded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "indexed": false, "internalType": "string", "name": "typeOfIncome", "type": "string" }
        ],
        "name": "IncomeReceived",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Withdrawn",
        "type": "event"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "name": "allUsers",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "BOOST_WINDOW",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "checkBoostStatus",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "checkBdiTier",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "DAY_PERIOD",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "DIRECT_INCOME_PCT",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "DOWNLINE_BONUS_PCT",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "emergencyWithdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "getRoiRate",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "JOIN_FEE",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_sponsor", "type": "address" }],
        "name": "join",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MIN_UPGRADE",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_seconds", "type": "uint256" }],
        "name": "setDayPeriod",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "specialUsers",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "UPLINE_BONUS_PCT",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_amount", "type": "uint256" }
        ],
        "name": "upgrade",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "usdt",
        "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "users",
        "outputs": [
            { "internalType": "bool", "name": "isRegistered", "type": "bool" },
            { "internalType": "address", "name": "sponsor", "type": "address" },
            { "internalType": "uint256", "name": "idValue", "type": "uint256" },
            { "internalType": "uint256", "name": "totalDeposited", "type": "uint256" },
            { "internalType": "uint256", "name": "joinTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "lastRoiTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "totalRoiEarned", "type": "uint256" },
            { "internalType": "uint256", "name": "pendingIncome", "type": "uint256" },
            { "internalType": "uint256", "name": "directReferrals", "type": "uint256" },
            { "internalType": "uint256", "name": "businessValue", "type": "uint256" },
            { "internalType": "bool", "name": "isBoosted2", "type": "bool" },
            { "internalType": "bool", "name": "isBoosted4", "type": "bool" },
            { "internalType": "uint256", "name": "bdiStartTime", "type": "uint256" },
            { "internalType": "uint256", "name": "lastBdiTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "currentBdiTier", "type": "uint256" },
            { "internalType": "uint256", "name": "bdiEndTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "totalBdiEarned", "type": "uint256" },
            { "internalType": "uint256", "name": "maxLegBusiness", "type": "uint256" },
            { "internalType": "uint256", "name": "lastRewardTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "rewardEndTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "totalRewardEarned", "type": "uint256" },
            { "internalType": "bool", "name": "isRewardActive", "type": "bool" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "pendingRoiIncome",
        "outputs": [
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "uint256", "name": "periodsSpent", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "pendingBdiIncome",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "pendingRewardIncome",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
        "name": "getReferrals",
        "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
        "stateMutability": "view",
        "type": "function"
    }
]

export const USDT_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "_spender", "type": "address" },
            { "name": "_value", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            { "name": "_owner", "type": "address" },
            { "name": "_spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
    }
]

export const USDT_ADDRESS_TESTNET = '0xc424d0fd08036da76d966c9d1b5d77b518b24504'
