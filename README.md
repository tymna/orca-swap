# orca-swap

Anchor program that swaps on Orca Whirlpools through CPI (SOL/USDC pool).

- `swap` builds the Whirlpool `swap` instruction by hand (discriminator + little-endian args) and calls it with `invoke`
- emits `SwapExecuted { user, amount_in, a_to_b }`
- `indexer/listen.ts` subscribes to program logs on devnet and decodes the events

Program `GRD4AsZgQoeb5MjPmdm5HJUFYuvi54sJj19rmTkFgHLe` on devnet.

## Tests

- `tests/local-swap.ts`: local validator with the Whirlpool program and mainnet SOL/USDC pool accounts cloned (see `Anchor.toml`). SOL → USDC, USDC → SOL, insufficient funds, slippage limit, zero amount
- `tests/devnet-swap.ts`: same swap against the devnet SOL/devUSDC pool

```bash
solana program dump -um whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc whirlpool.so
anchor build
anchor test                     # localnet
anchor run test-devnet          # devnet
npx ts-node indexer/listen.ts   # event listener
```
