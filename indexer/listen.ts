import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, EventParser } from "@coral-xyz/anchor";
import * as idl from "../target/idl/whirlpool_swap.json";

const PROGRAM_ID = new PublicKey("GRD4AsZgQoeb5MjPmdm5HJUFYuvi54sJj19rmTkFgHLe");
const RPC_URL = "https://api.devnet.solana.com";
const WS_URL = "wss://api.devnet.solana.com";

const connection = new Connection(RPC_URL, {
  wsEndpoint: WS_URL,
  commitment: "confirmed",
});

const provider = new AnchorProvider(connection, {} as Wallet, {});
const program = new Program(idl as any, provider);
const eventParser = new EventParser(PROGRAM_ID, program.coder);

console.log(`Listening for SwapExecuted events on devnet...`);
console.log(`Program: ${PROGRAM_ID.toBase58()}\n`);

connection.onLogs(PROGRAM_ID, (logs) => {
  if (logs.err) return;

  const events = eventParser.parseLogs(logs.logs);
  for (const event of events) {
    console.log(`--- SwapExecuted ---`);
    console.log(`  tx:        ${logs.signature}`);
    console.log(`  user:      ${event.data.user.toBase58()}`);
    console.log(`  amount_in: ${event.data.amountIn.toString()}`);
    console.log(`  a_to_b:    ${event.data.aToB}`);
    console.log(`  time:      ${new Date().toISOString()}`);
    console.log();
  }
}, "confirmed");
