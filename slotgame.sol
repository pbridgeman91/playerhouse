// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IDirectFundingConsumer {
    function requestRandomWords(bool enableNativePayment) external returns (uint256);
    function getSeed() external view returns (uint256);
}

contract slotgame {
    uint8  public constant NUM_ROWS  = 3;
    uint8  public constant NUM_REELS = 5;
    uint8  public constant WILD      = 7;
    uint8  public constant FS        = 8;
    uint8  public constant BONUS     = 9;
    uint256 public constant MAX_WIN  = 500e6;
    uint8   public constant MAX_LINES = 20;

    address public immutable owner;
    IERC20 public immutable usdc;
    IDirectFundingConsumer public immutable vrf;

    struct Bet {
        uint80 amount;
        uint8  lines;
        uint168 _pad;
    }

    mapping(address => uint8) public freeSpins;
    mapping(address => uint256) public nonces;
    mapping(address => Bet) private lastBet;

    event SpinResult(
        address indexed player,
        uint256 totWin,
        uint8[NUM_REELS][NUM_ROWS] pattern,
        bool freespin,
        bool bonus,
        uint8 numFreespin,
        uint256 bonusPrize,
        uint8[] bonusPrizeIndexes
    );

    constructor(address _usdc, address _vrf) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        vrf = IDirectFundingConsumer(_vrf);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "!owner");
        _;
    }

    function spin(bytes32 secret, uint256 bet, uint8 numLines) external {
        address player = msg.sender;
        bool useFS = freeSpins[player] > 0;
        Bet memory b = lastBet[player];

        uint256 usedBet;
        uint8 usedLines;

        if (useFS) {
            require(b.amount > 0 && b.lines > 0, "no base bet");
            usedBet = b.amount;
            usedLines = b.lines;
            unchecked { freeSpins[player]--; }
            require(usdc.transferFrom(player, address(this), 1), "micro pay fail");
        } else {
            require(numLines >= 10 && numLines <= 20, "lines");
            require(bet * numLines >= 2_000_000 && bet * numLines <= 10_000_000, "bet");
            require(usdc.transferFrom(player, address(this), bet * numLines), "pay fail");
            usedBet = bet;
            usedLines = numLines;
            lastBet[player] = Bet(uint80(bet), numLines, 0);
        }

        vrf.requestRandomWords(true);
        bytes32 seed = keccak256(
            abi.encodePacked(vrf.getSeed(), secret, player, nonces[player]++)
        );

        uint8[NUM_REELS][NUM_ROWS] memory pattern;
        _fillPattern(pattern, seed);

        (uint256 win, uint8 fsSym, uint8 bonusSym) = _evaluate(pattern, usedLines, usedBet);

        uint8 newFS;
        if (fsSym >= 3) newFS = fsSym == 3 ? 3 : fsSym == 4 ? 4 : 5;
        if (newFS > 0) freeSpins[player] += newFS;

        uint256 bonusPrize;
        uint8[] memory picks;
        if (bonusSym >= 3) {
            (bonusPrize, picks) = _bonusPrize(seed, bonusSym, usedBet);
            require(bonusPrize <= MAX_WIN, "bonus>MAX");
            require(usdc.transfer(player, bonusPrize), "bonus xfer");
        }

        if (win > 0) {
            require(win <= MAX_WIN, "win>MAX");
            require(usdc.transfer(player, win), "win xfer");
        }

        emit SpinResult(
            player,
            win,
            pattern,
            newFS > 0,
            bonusSym >= 3,
            freeSpins[player],
            bonusPrize,
            picks
        );
    }

    function _row(uint8 line, uint8 col) private pure returns (uint8) {
        unchecked {
            uint8[20][5] memory R = [
                [1,0,2,0,2,1,1,0,2,1,1,0,2,0,2,1,1,0,2,0], // col0
                [1,0,2,1,1,0,2,0,2,2,0,1,1,1,1,1,1,0,2,2], // col1
                [1,0,2,2,0,0,2,1,1,1,1,1,1,0,2,0,2,2,0,2], // col2
                [1,0,2,1,1,0,2,2,0,0,2,1,1,1,1,1,1,0,2,2], // col3
                [1,0,2,0,2,1,1,2,0,1,1,0,2,0,2,1,1,0,2,0]  // col4
            ];
            return R[col][line];
        }
    }

    function _fillPattern(uint8[NUM_REELS][NUM_ROWS] memory g, bytes32 seed) private pure {
        uint256 state = uint256(seed);
        for (uint8 r; r < NUM_ROWS; ++r) {
            for (uint8 c; c < NUM_REELS; ++c) {
                if (state == 0) state = uint256(keccak256(abi.encodePacked(seed, r, c)));
                uint16 rnd = uint16(state % 62);
                state >>= 16;

                uint8 s = _pickSym(rnd);
                if (c == 0 && s == WILD) s = 0;
                g[r][c] = s;
            }
        }
    }

    function _pickSym(uint16 rnd) private pure returns (uint8 s) {
        unchecked {
            if (rnd < 10) return 0;
            if (rnd < 20) return 1;
            if (rnd < 30) return 2;
            if (rnd < 39) return 3;
            if (rnd < 46) return 4;
            if (rnd < 51) return 5;
            if (rnd < 54) return 6;
            if (rnd < 58) return 7;
            if (rnd < 60) return 8;
            return 9;
        }
    }

    function _pay(uint8 sym, uint8 hits) private pure returns (uint16) {
        unchecked {
            if (hits < 3 || sym >= WILD) return 0;
            if (sym < 3)  return hits == 3 ? 10 : hits == 4 ? 25 : 100;
            if (sym == 3) return hits == 3 ? 15 : hits == 4 ? 40 : 150;
            if (sym == 4) return hits == 3 ? 20 : hits == 4 ? 50 : 200;
            if (sym == 5) return hits == 3 ? 30 : hits == 4 ? 70 : 300;
            return hits == 3 ? 30 : hits == 4 ? 100 : 500; // sym == 6
        }
    }

    function _evaluate(
        uint8[NUM_REELS][NUM_ROWS] memory g,
        uint8 lines,
        uint256 coin
    ) private pure returns (uint256 win, uint8 fsSym, uint8 bonusSym) {
        unchecked {
            for (uint8 l; l < lines; ++l) {
                uint8 sym = g[_row(l, 0)][0];
                uint8 hits = 1;
                uint8 c = 1;

                while (sym == WILD && c < NUM_REELS) {
                    sym = g[_row(l, c)][c];
                    hits++;
                    c++;
                }

                for (; c < NUM_REELS; ++c) {
                    uint8 v = g[_row(l, c)][c];
                    if (v == sym || v == WILD) hits++;
                    else break;
                }

                win += uint256(_pay(sym, hits)) * coin;
            }

            for (uint8 r; r < NUM_ROWS; ++r) {
                for (uint8 c; c < NUM_REELS; ++c) {
                    uint8 s = g[r][c];
                    if (s == FS) ++fsSym;
                    else if (s == BONUS) ++bonusSym;
                }
            }
        }
    }

    function _bonusPrize(bytes32 seed, uint8 bCnt, uint256 bet)
        private pure returns (uint256 sum, uint8[] memory picks)
    {
        uint8[5] memory w = [50, 25, 15, 7, 3];
        uint8[5] memory p = [10, 20, 40, 60, 80];
        uint8 shots = bCnt > 5 ? 5 : bCnt;
        picks = new uint8[](shots);
        uint256 state = uint256(seed);

        for (uint8 i; i < shots; ++i) {
       if (state == 0) {
           state = uint256(keccak256(abi.encodePacked(seed, i, "B")));
       }
       // reduce into [0..totalWeight)
       uint16 rnd = uint16(state % 100);
       state >>= 16;

            uint16 acc;
            uint8 pick;
            for (uint8 j; j < 5; ++j) {
                acc += w[j];
                if (rnd < acc) { pick = j; break; }
            }

            picks[i] = pick;
            sum += uint256(p[pick]) * bet;
        }
    }

    function withdrawUSDC(address to, uint256 amt) external onlyOwner {
        require(usdc.transfer(to, amt), "xfer");
    }

    function usdcBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
