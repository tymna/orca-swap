# Events: Solidity vs Anchor (Solana)

## Solidity (EVM)

### How it works under the hood

When you `emit Transfer(from, to, amount)`:

1. Compiler generates a **LOG opcode** (LOG0–LOG4)
2. The event signature hash (`keccak256("Transfer(address,address,uint256)")`) becomes **topic[0]**
3. `indexed` parameters become **topic[1], topic[2], topic[3]** (max 3 indexed)
4. Non-indexed parameters are **ABI-encoded into the data field**
5. The log is stored in the **transaction receipt** (not in contract storage — cheaper)

### Storage

- Events live in **bloom filters** per block — allows fast filtering by topic
- Full log data is in transaction receipts
- Logs are NOT accessible from on-chain code — they're write-only
- Archive nodes store all historical logs

### Indexing

- `indexed` keyword creates **topics** — these are searchable via `eth_getLogs`
- You can filter by topic: "give me all Transfer events where `from = 0xABC`"
- Max 3 indexed params per event (+ topic[0] is the signature)
- Non-indexed params can't be filtered, only read after fetching

### Cost

- LOG0: 375 gas base
- Each topic: +375 gas
- Data: 8 gas per byte
- Cheap compared to storage (SSTORE = 20,000 gas)

### Reading events

```javascript
// ethers.js
const filter = contract.filters.Transfer(fromAddress, null);
const events = await contract.queryFilter(filter, fromBlock, toBlock);
```

RPC methods: `eth_getLogs`, `eth_subscribe("logs", ...)` for real-time.

---

## Anchor / Solana

### How it works under the hood

When you `emit!(SwapExecuted { user, amount_in, a_to_b })`:

1. Anchor's `emit!` macro calls `sol_log_data`
2. The event is **Borsh-serialized** (not ABI-encoded like EVM)
3. An 8-byte **discriminator** (first 8 bytes of `sha256("event:SwapExecuted")`) is prepended
4. The full payload is written to the **transaction log** as a `Program data:` entry (base64-encoded)
5. Logs are part of the transaction metadata, not stored on-chain in accounts

### Storage

- Logs live in **transaction metadata** on validators
- NOT in account data — they don't cost rent
- Validators can prune old transaction logs (not guaranteed permanent like EVM archive nodes)
- No bloom filters, no native topic-based indexing

### Indexing

- Solana has **no native event filtering** — no equivalent of `eth_getLogs` with topic filters
- You must use external indexers:
  - **Helius** — webhooks + enhanced API, auto-parses Anchor events
  - **Yellowstone gRPC** — stream from validator, filter by program ID
  - **Surfpool** — local dev tool, surfaces events during testing
  - **Custom** — parse `Program data:` lines from transaction logs yourself

### Cost

- `sol_log_data` costs compute units (CU), not lamports directly
- Each transaction has a 200,000 CU budget (can request up to 1.4M)
- Logging is relatively cheap in CU but adds up with large payloads
- No concept of "indexed" vs "non-indexed" — everything is just serialized bytes

### Reading events

```typescript
// parse from transaction logs
const tx = await connection.getTransaction(sig);
const logs = tx.meta.logMessages;
// look for "Program data: <base64>" lines

// with Anchor's EventParser
const parser = new anchor.EventParser(program.programId, program.coder);
const events = [];
parser.parseLogs(logs, (event) => events.push(event));
```

---

## Side-by-side comparison

| Aspect | Solidity (EVM) | Anchor (Solana) |
|--------|---------------|-----------------|
| Emit syntax | `emit EventName(val1, val2)` | `emit!(EventName { field1: val1, field2: val2 })` |
| Declaration | `event EventName(type indexed param)` | `#[event] pub struct EventName { pub field: Type }` |
| Encoding | ABI encoding | Borsh serialization |
| Identifier | `keccak256` of signature (32 bytes) | `sha256("event:Name")` first 8 bytes |
| Indexed fields | Yes, up to 3 `indexed` params as topics | No — no native indexing concept |
| On-chain filtering | `eth_getLogs` with topic filters | None — need external indexer |
| Storage location | Transaction receipt + bloom filter | Transaction log metadata |
| Permanence | Archive nodes keep forever | Validators may prune old tx logs |
| Cost | 375+ gas (cheap vs storage) | Compute units (cheap vs account rent) |
| Accessible on-chain | No (write-only) | No (write-only) |
| Real-time subscription | `eth_subscribe("logs")` | Yellowstone gRPC / websocket `logsSubscribe` |

## Key takeaways

1. **Both are write-only** — on-chain code can emit but never read events
2. **EVM has native indexing, Solana doesn't** — this is the biggest practical difference
3. **EVM events are permanent (archive nodes), Solana logs can be pruned** — for long-term storage on Solana, use external indexers that persist data
4. **Solana uses Borsh, EVM uses ABI encoding** — different serialization, same concept
5. **Both are cheap compared to storage** — events/logs exist for off-chain consumers, not on-chain state

## In this project

```rust
// lib.rs — declaration
#[event]
pub struct SwapExecuted {
    pub user: Pubkey,
    pub amount_in: u64,
    pub a_to_b: bool,
}

// instructions/swap.rs — emission
orca::swap_cpi(...)?;  // CPI must succeed first

emit!(SwapExecuted {
    user: ctx.accounts.token_authority.key(),
    amount_in: amount,
    a_to_b,
});

Ok(())
```

Pattern: **define → import → emit after side effects → Ok(())**
