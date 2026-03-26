import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhirlpoolSwap } from "../target/types/whirlpool_swap";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { assert } from "chai";

// --- Constants ---
const WHIRLPOOL_PROGRAM_ID = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const SOL_USDC_POOL = new PublicKey("HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TICK_ARRAY_SIZE = 88;

// sqrt price limits
const MIN_SQRT_PRICE = new anchor.BN("4295048016");
const MAX_SQRT_PRICE = new anchor.BN("79226673515401279992447579055");

describe("whirlpool-swap (localnet)", () => {
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

    // read pool data (cloned from mainnet)
    const poolAccountInfo = await provider.connection.getAccountInfo(SOL_USDC_POOL);
    if (!poolAccountInfo) throw new Error("Pool account not found — if using surfpool, ensure it forks mainnet: surfpool start --rpc-url https://api.mainnet-beta.solana.com");
    if (poolAccountInfo.data.length < 245) throw new Error(`Pool data too small (${poolAccountInfo.data.length} bytes) — account may not be fully loaded from mainnet`);

    const data = poolAccountInfo.data;
    tokenVaultA = new PublicKey(data.subarray(133, 165));
    tokenVaultB = new PublicKey(data.subarray(213, 245));
    tickSpacing = data.readUInt16LE(41);
    tickCurrentIndex = data.readInt32LE(81);
    ticksPerArray = tickSpacing * TICK_ARRAY_SIZE;
    currentStartTick = Math.floor(tickCurrentIndex / ticksPerArray) * ticksPerArray;

    // derive ATAs
    myWsolAccount = await getAssociatedTokenAddress(WSOL_MINT, wallet.publicKey);
    myUsdcAccount = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);

    // derive oracle PDA
    [oracle] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle"), SOL_USDC_POOL.toBuffer()],
      WHIRLPOOL_PROGRAM_ID,
    );

    // create ATAs and fund WSOL (fresh local chain — nothing exists)
    const tx = new Transaction();

    // create WSOL ATA
    tx.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, myWsolAccount, wallet.publicKey, WSOL_MINT,
      ),
    );
    // create USDC ATA
    tx.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, myUsdcAccount, wallet.publicKey, USDC_MINT,
      ),
    );
    // transfer SOL into WSOL ATA and sync
    tx.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: myWsolAccount,
        lamports: 100_000_000, // 0.1 SOL
      }),
    );
    tx.add(createSyncNativeInstruction(myWsolAccount));

    await provider.sendAndConfirm(tx);

    console.log("Token Vault A (WSOL):", tokenVaultA.toBase58());
    console.log("Token Vault B (USDC):", tokenVaultB.toBase58());
    console.log("Tick spacing:", tickSpacing);
    console.log("Current tick:", tickCurrentIndex);
    console.log("WSOL ATA:", myWsolAccount.toBase58());
    console.log("USDC ATA:", myUsdcAccount.toBase58());
  });

  it("swaps SOL for USDC", async () => {
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
    assert.isTrue(usdcAfter > usdcBefore, "USDC balance should increase after a_to_b swap");
    console.log("USDC received:", Number(usdcAfter - usdcBefore) / 1e6);
    console.log("Tx:", tx);

    // parse event from transaction logs
    await provider.connection.confirmTransaction(tx, "confirmed");
    const txDetails = await provider.connection.getTransaction(tx, { commitment: "confirmed" });
    const events = [];
    const parser = new anchor.EventParser(program.programId, program.coder);
    for (const event of parser.parseLogs(txDetails.meta.logMessages)) {
      events.push(event);
    }

    assert.equal(events.length, 1, "should emit exactly one event");
    assert.equal(events[0].name, "swapExecuted");
    assert.equal(events[0].data.user.toBase58(), wallet.publicKey.toBase58());
    assert.equal(events[0].data.amountIn.toNumber(), 1_000_000);
    assert.equal(events[0].data.aToB, true);
    console.log("Event:", events[0].data);
  });

  it("swaps USDC for SOL", async () => {
    const wsolBefore = (await getAccount(provider.connection, myWsolAccount)).amount;

    // b_to_a: current, one above, two above
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick + ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick + 2 * ticksPerArray);

    const tx = await program.methods
      .swap(
        new anchor.BN(10_000),        // 0.01 USDC
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

    // parse event from transaction logs
    await provider.connection.confirmTransaction(tx, "confirmed");
    const txDetails = await provider.connection.getTransaction(tx, { commitment: "confirmed" });
    const events = [];
    const parser = new anchor.EventParser(program.programId, program.coder);
    for (const event of parser.parseLogs(txDetails.meta.logMessages)) {
      events.push(event);
    }

    assert.equal(events.length, 1, "should emit exactly one event");
    assert.equal(events[0].name, "swapExecuted");
    assert.equal(events[0].data.user.toBase58(), wallet.publicKey.toBase58());
    assert.equal(events[0].data.amountIn.toNumber(), 10_000);
    assert.equal(events[0].data.aToB, false);
    console.log("Event:", events[0].data);
  });

  // --- Revert cases ---

  it("reverts on insufficient funds", async () => {
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick - ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick - 2 * ticksPerArray);

    try {
      await program.methods
        .swap(
          new anchor.BN(999_000_000_000), // way more than we have
          new anchor.BN(0),
          MIN_SQRT_PRICE,
          true,
          true,
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
      assert.fail("should have reverted");
    } catch (err) {
      assert.ok(err, "transaction should fail with insufficient funds");
    }
  });

  it("reverts when slippage threshold exceeded", async () => {
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick - ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick - 2 * ticksPerArray);

    try {
      await program.methods
        .swap(
          new anchor.BN(1_000_000),
          new anchor.BN("999999999999"),  // absurdly high min output
          MIN_SQRT_PRICE,
          true,
          true,
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
      assert.fail("should have reverted");
    } catch (err) {
      assert.ok(err, "transaction should fail with slippage exceeded");
    }
  });

  it("reverts on zero amount", async () => {
    const tickArray0 = deriveTickArray(currentStartTick);
    const tickArray1 = deriveTickArray(currentStartTick - ticksPerArray);
    const tickArray2 = deriveTickArray(currentStartTick - 2 * ticksPerArray);

    try {
      await program.methods
        .swap(
          new anchor.BN(0),
          new anchor.BN(0),
          MIN_SQRT_PRICE,
          true,
          true,
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
      assert.fail("should have reverted");
    } catch (err) {
      assert.ok(err, "transaction should fail with zero amount");
    }
  });
});
