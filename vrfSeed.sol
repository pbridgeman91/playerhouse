// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ConfirmedOwner}           from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {LinkTokenInterface}       from "@chainlink/contracts/src/v0.8/shared/interfaces/LinkTokenInterface.sol";
import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";
import {VRFV2PlusClient}          from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract DirectFundingConsumer is VRFV2PlusWrapperConsumerBase, ConfirmedOwner {
    /* ─────────────── events ─────────────── */
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256 payment);
    event Received(address indexed from, uint256 amount);

    /* ─────────────── structs / storage ─────────────── */
    struct RequestStatus {
        uint256 paid;        // LINK / native paid
        bool    fulfilled;   // callback done
        uint256 randomWord;  // first word only, stored privately
    }

    mapping(uint256 => RequestStatus) private s_requests;  // ‼️  made private
    uint256[] public  requestIds;
    uint256  public  lastRequestId;

    uint256 private globalSeed;      // ‼️  not public any more
    uint256 public  requestCount;

    /* ───────────────  VRF config  ─────────────── */
    uint32 public  callbackGasLimit      = 300_000;
    uint16 public  requestConfirmations  = 2;
    uint32 public  numWords              = 1;

    address public constant LINK_TOKEN   = 0xb1D4538B4571d411F07960EF2838Ce337FE1E80E;
    address public constant WRAPPER      = 0x29576aB8152A09b9DC634804e4aDE73dA1f3a3CC;

    /* ─────────────── external hook ─────────────── */
    address public slotaddr;                       // game contract allowed to pull the seed

    modifier onlySlot() {
        require(msg.sender == slotaddr, "not slot");
        _;
    }

    constructor(address _slotaddr)
        ConfirmedOwner(msg.sender)
        VRFV2PlusWrapperConsumerBase(WRAPPER)
    {
        slotaddr = _slotaddr;
    }

    /* ──────────────────── user-facing API ──────────────────── */
    function requestRandomWords(bool nativePay) external onlySlot returns (uint256 reqId) {
        // decide if we actually need a new seed (every 200 spins or first time)
        requestCount++;
        bool fresh = (globalSeed == 0 || requestCount % 200 == 0);
        if (!fresh) return 0;                       

        bytes memory extra = VRFV2PlusClient._argsToBytes(
            VRFV2PlusClient.ExtraArgsV1({nativePayment: nativePay})
        );

        uint256 price;
        if (nativePay) {
            (reqId, price) = requestRandomnessPayInNative(
                callbackGasLimit, requestConfirmations, numWords, extra
            );
        } else {
            (reqId, price) = requestRandomness(
                callbackGasLimit, requestConfirmations, numWords, extra
            );
        }

        s_requests[reqId] = RequestStatus({
            paid: price,
            fulfilled: false,
            randomWord: 0
        });

        requestIds.push(reqId);
        lastRequestId = reqId;

        emit RequestSent(reqId, numWords);
    }

    /* ──────────────────── VRF callback ──────────────────── */
    function fulfillRandomWords(
        uint256 reqId,
        uint256[] memory words
    ) internal override {
        RequestStatus storage R = s_requests[reqId];
        require(R.paid > 0, "unknown request");

        R.fulfilled  = true;
        R.randomWord = words[0];        // store only first word
        globalSeed   = words[0];

        emit RequestFulfilled(reqId, R.paid);
    }

    /* ──────────────────── slot-machine pull ──────────────────── */
    function getSeed() external view onlySlot returns (uint256) {
        if (globalSeed == 0) {
            // fallback entropy on very first spin
            return uint256(
                keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, msg.sender))
            );
        }
        return globalSeed;
    }

    /* ──────────────────── owner helpers ──────────────────── */
    /** Lightweight status helper that does NOT leak the random word. */
    function getRequestStatus(uint256 reqId)
        external view onlyOwner
        returns (uint256 paid, bool fulfilled)
    {
        RequestStatus memory R = s_requests[reqId];
        require(R.paid > 0, "request not found");
        return (R.paid, R.fulfilled);
    }

    function withdrawLink() external onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(LINK_TOKEN);
        require(link.transfer(msg.sender, link.balanceOf(address(this))), "LINK xfer fail");
    }

    function withdrawNative(uint256 amountWei) external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: amountWei}("");
        require(ok, "native xfer fail");
    }

    function updateSlotAddr(address newSlot) external onlyOwner {
        require(newSlot != address(0), "bad slotaddr");
        slotaddr = newSlot;
    }

    /* ──────────────────── fallback ──────────────────── */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
