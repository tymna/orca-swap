import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhirlpoolSwap } from "../target/types/whirlpool_swap";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { assert } from "chai";

// --- Constants ---
const WHIRLPOOL_PROGRAM_ID = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const SOL_USDC_POOL = new PublicKey("3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const DEV_USDC_MINT = new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
const TICK_ARRAY_SIZE = 88;

// sqrt price limits
const MIN_SQRT_PRICE = new anchor.BN("4295048016");
const MAX_SQRT_PRICE = new anchor.BN("79226673515401279992447579055");

describe("whirlpool-swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.whirlpoolSwap as Program<WhirlpoolSwap>;
  const wallet = provider.wallet as anchor.Wallet;

  // shared state — populated in before()
  let tokenVaultA: PublicKey;
  let tokenVaultB: PublicKey;
  let tickSpacing: number;
  let tickCurrentIndex: number;
  let ticksPerArray: number;
  let currentStartTick: number;
  let myWsolAccount: PublicKey;
  let myUsdcAccount: PublicKey;
  let oracle: PublicKey;

  function deriveTickArray(startTick: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), SOL_USDC_POOL.toBuffer(), Buffer.from(startTick.toString())],
      WHIRLPOOL_PROGRAM_ID,
    );
    return pda;
  }

  before(async () => {
    console.log("Wallet:", wallet.publicKey.toBase58());
    console.log("Program:", program.programId.toBase58());

    // read pool data
    const poolAccountInfo = await provider.connection.getAccountInfo(SOL_USDC_POOL);
    if (!poolAccountInfo) throw new Error("Pool account not found on devnet");

    const data = poolAccountInfo.data;
    tokenVaultA = new PublicKey(data.subarray(133, 165));
    tokenVaultB = new PublicKey(data.subarray(213, 245));
    tickSpacing = data.readUInt16LE(41);
    tickCurrentIndex = data.readInt32LE(81);
    ticksPerArray = tickSpacing * TICK_ARRAY_SIZE;
    currentStartTick = Math.floor(tickCurrentIndex / ticksPerArray) * ticksPerArray;

    // derive ATAs
    myWsolAccount = await getAssociatedTokenAddress(WSOL_MINT, wallet.publicKey);
    myUsdcAccount = await getAssociatedTokenAddress(DEV_USDC_MINT, wallet.publicKey);

    // derive oracle PDA — same as orca do
    [oracle] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle"), SOL_USDC_POOL.toBuffer()],
      WHIRLPOOL_PROGRAM_ID,
    );

    console.log("Token Vault A (WSOL):", tokenVaultA.toBase58());
    console.log("Token Vault B (devUSDC):", tokenVaultB.toBase58());
    console.log("Tick spacing:", tickSpacing);
    console.log("Current tick:", tickCurrentIndex);
    console.log("WSOL ATA:", myWsolAccount.toBase58());
    console.log("devUSDC ATA:", myUsdcAccount.toBase58());
  });

  it("swaps SOL for devUSDC", async () => {
    const usdcBefore = (await getAccount(provider.connection, myUsdcAccount)).amount;

    // a_to_b: current, one below, two below
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick - ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick - 2 * ticksPerArray);

    const tx = await program.methods
      .swap(
        new anchor.BN(1_000_000),    // 0.001 SOL
        new anchor.BN(0),
        MIN_SQRT_PRICE,
        true,
        true,                         // a_to_b
      )
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenAuthority: wallet.publicKey,
        whirlpool: SOL_USDC_POOL,
        tokenOwnerAccountA: myWsolAccount,
        tokenVaultA: tokenVaultA,
        tokenOwnerAccountB: myUsdcAccount,
        tokenVaultB: tokenVaultB,
        tickArray0,
        tickArray1,
        tickArray2,
        oracle,
        whirlpoolProgram: WHIRLPOOL_PROGRAM_ID,
      })
      .rpc();

    const usdcAfter = (await getAccount(provider.connection, myUsdcAccount)).amount;
    assert.isTrue(usdcAfter > usdcBefore, "devUSDC balance should increase after a_to_b swap");
    console.log("devUSDC received:", Number(usdcAfter - usdcBefore) / 1e6);

    console.log("Tx:", tx);
    console.log("Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });

  it("swaps devUSDC for SOL", async () => {
    const wsolBefore = (await getAccount(provider.connection, myWsolAccount)).amount;

    // b_to_a: current, one above, two above
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick + ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick + 2 * ticksPerArray);

    const tx = await program.methods
      .swap(
        new anchor.BN(10_000),        // 0.01 devUSDC
        new anchor.BN(0),
        MAX_SQRT_PRICE,
        true,
        false,                         // b_to_a
      )
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenAuthority: wallet.publicKey,
        whirlpool: SOL_USDC_POOL,
        tokenOwnerAccountA: myWsolAccount,
        tokenVaultA: tokenVaultA,
        tokenOwnerAccountB: myUsdcAccount,
        tokenVaultB: tokenVaultB,
        tickArray0,
        tickArray1,
        tickArray2,
        oracle,
        whirlpoolProgram: WHIRLPOOL_PROGRAM_ID,
      })
      .rpc();

    const wsolAfter = (await getAccount(provider.connection, myWsolAccount)).amount;
    assert.isTrue(wsolAfter > wsolBefore, "WSOL balance should increase after b_to_a swap");
    console.log("WSOL received:", Number(wsolAfter - wsolBefore) / 1e9);

    console.log("Tx:", tx);
    console.log("Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });
});
