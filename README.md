# 🎰 PlayerHouse — Fully Onchain Slot Machine Protocol

**PlayerHouse** is the first truly onchain slot machine. No custodians. No withdrawal buttons. No backend RNGs. Every spin, symbol, and payout is computed and enforced by smart contracts.


## 🎮 Why This Matters
In traditional casinos, there’s a regulator called **Gaming**. Their job is to audit machines/shuffles, verify odds, and protect players from being scammed. Online casinos—especially crypto ones—don’t have this. They operate offshore, manipulate backend odds, and stall or deny withdrawals.

**PlayerHouse removes the need for trust by putting all logic—spin, payout, bonus, randomness—on-chain. The smart contract *is* the regulator.**

---

## 🔑 What Makes PlayerHouse Different

- **No Deposits** — users spin directly from their own wallet  
- **No Withdrawals** — payouts happen instantly, during the transaction  
- **No RNG Black Box** — all randomness is Chainlink VRF  
- **No Middlemen** — no one can delay, block, or reverse a spin  
- **Fully Transparent** — every rule, payout, and symbol is verifiable onchain  

---

## 🧱 Contract Overview

This repo contains two key contracts:

- [`slotmachine.sol`](#1-freesspingasfnalmachinesol) — the main slot machine game logic  
- [`vrf.sol`](#2-vrfsoldirectfundingconsumer) — randomness provider via Chainlink VRF  

---

## 1. `slotgame.sol`

This is the **core game engine**. It implements:

- Paid and free spins  
- 20 fixed paylines  
- Symbol payout evaluation  
- Bonus prize generation (10x–80x, weighted)  
- Free spin triggers  
- USDC-based betting  
- Integration with Chainlink VRF seed via `vrf.sol`  

### 🎮 Gameplay Flow

1. Player calls `spin(secret, bet, lines)`
2. Contract pulls VRF seed from `vrf.sol`
3. Combines: `keccak256(secret, seed, msg.sender, nonce)`
4. Reels are generated using this entropy
5. Lines are evaluated for wins
6. If 3+ bonus symbols are hit, a weighted bonus prize is awarded
7. If 3+ free spin symbols are hit, free spins are granted
8. All winnings are paid immediately in USDC

### 🧾 Key Functions

- `spin(bytes32 secret, uint256 bet, uint8 numLines)`
- `_evaluate(...)` — scans paylines for matches  
- `_bonusPrize(...)` — selects prizes using weighted randomness  
- `withdrawUSDC(...)` — owner-only function to extract protocol USDC fees  


---

## 2. `vrf.sol` — DirectFundingConsumer

This contract securely provides randomness via Chainlink VRF.

### 🔐 Responsibilities

- Request randomness (LINK or ETH payment)
- Store and serve the current global seed
- Refresh the seed every 200 spins
- Restrict access to the authorized slot machine contract only


### 🔑 Key Functions

- `requestRandomWords(bool nativePay)` — request new seed  
- `fulfillRandomWords(...)` — callback from Chainlink  
- `getSeed()` — returns current seed (or fallback if unset)  
- `updateSlotAddr(address newSlot)` — set new authorized game   

### 🔒 Access Control

| Function             | Access       |
|----------------------|--------------|
| `getSeed()`          | Only slot contract |
| `requestRandomWords()` | Only slot contract |
| `updateSlotAddr()`   | Only owner |
| `withdraw*()`        | Only owner |


---

## 🔁 Randomness Flow

1. On spin, slot contract calls `getSeed()`  
2. If no seed or 200 spins passed, `vrf.sol` requests new randomness  
3. Chainlink fulfills the request, updating `globalSeed`  
4. Slot uses:  
   `keccak256(seed, secret, player, nonce)`  
   to derive entropy for reels, bonuses, and features
   
🔒 While Chainlink VRF provides verifiable randomness, it alone isn’t enough.
Without an additional off-chain secret, attackers could simulate outcomes before sending transactions.
By requiring a player-supplied secret (only known off-chain at the time of the call), we guarantee:
Front-running resistance — spin results can’t be predicted or precomputed from calldata
Replay protection — every spin is unique, even with the same bet and lines
True per-spin entropy — deterministic randomness that stays tamper-proof

Reels are generated using this combined entropy

---

## 🔐 Security Considerations

- ✅ No backend RNG  
- ✅ No custodial balance tracking  
- ✅ All game outcomes are fully deterministic  
- ✅ All randomness is verifiable via Chainlink  
- ✅ Bonus + free spin logic is audit-friendly  
- ✅ Payouts are trustless and immediate  

---

## 🚧 Future Extensions

- 🏛️ Tokenized vaults for player-owned “House” liquidity  
- 🎁 Revenue sharing for token holders + referrers  
- 🗳️ DAO governance of house parameters  
- 🖼️ Additional game skins/themes with shared logic  
- 🏆 Leaderboards, tournaments, and prize pools  

---

## 📜 License

MIT
